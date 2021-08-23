const { path: postPath } = Runtime.getFunctions()['helpers/post'];
const post = require(postPath);
const { path: serializePath } = Runtime.getFunctions()['helpers/serialize'];
const { serialize } = require(serializePath);

const KEY_REQUESTED = {
  READ: 'read',
  CAN_REFUSE: 'canRefuse',
  NONE: 'none',
};

const KEYS = {
  ACCEPT: '1',
  REFUSE: '2',
};

/* TwiML creation: hang up the call. */
function twimlHangUp() {
  const twiml = new Twilio.twiml.VoiceResponse();
  twiml.hangup();
  return twiml;
}

/* TwiML creation: Gather that loops on itself while not answered. */
function twimlGather(context, event) {
  const { textLanguage, textVoice, keyRequested, keyRequestTextToSay, keyRequestFileUrl } = event;
  const currentUrl = `https://${context.DOMAIN_NAME}/call/webhook?${serialize(event)}`;

  const twiml = new Twilio.twiml.VoiceResponse();
  const gather = twiml.gather({
    input: 'dtmf',
    timeout: 5,
    numDigits: 1,
    action: currentUrl,
  });
  if (keyRequestTextToSay) {
    gather.say(
      {
        voice: textVoice,
        language: textLanguage,
      },
      keyRequestTextToSay,
    );
  } else if (keyRequestFileUrl) {
    gather.play(keyRequestFileUrl);
  } else {
    gather.say(
      keyRequested === KEYS.REFUSE ? context.GATHER_BASE_MESSAGE_CAN_REFUSE : context.GATHER_BASE_MESSAGE_READ,
    );
  }
  twiml.redirect(currentUrl);
  return twiml;
}

/* TwiML creation: Say or Play that loops on itself while not hung up. */
function twimlSayPlay(context, event) {
  const { textToSay, textLanguage, textVoice, playFileUrl } = event;
  const currentUrl = `https://${context.DOMAIN_NAME}/call/webhook?${serialize(event)}`;

  const twiml = new Twilio.twiml.VoiceResponse();
  if (textToSay) {
    twiml.say(
      {
        voice: textVoice,
        language: textLanguage,
      },
      textToSay,
    );
  } else if (playFileUrl) {
    twiml.play(playFileUrl);
  }
  twiml.redirect(currentUrl);
  return twiml;
}

/* Update a call to start the new TwiML and update the call statusCallback url. */
function updateCall(context, callSid, twiml, statusCallbackUrl) {
  const twilioClient = context.getTwilioClient();
  return twilioClient
    .calls(callSid)
    .update({
      twiml: twiml.toString(),
      statusCallback: statusCallbackUrl,
    })
    .catch((reason) => {
      return twimlHangUp();
    })
    .then((call) => {
      return null;
    });
}

/* Update a call to start the Gather. */
async function startGather(context, event) {
  const { CallSid } = event;
  const twiml = twimlGather(context, event);

  console.log(twiml.toString());

  // modify the call's statusCallback to add "inGather" parameter
  const statusCallbackUrl = `https://${context.DOMAIN_NAME}/call/webhook?${serialize({
    ...event,
    inGather: true,
  })}`;
  return updateCall(context, CallSid, twiml, statusCallbackUrl);
}

/* Update a call to start the Say or Play. */
async function startSayPlay(context, event) {
  const { CallSid } = event;
  const twiml = twimlSayPlay(context, event);

  console.log(twiml.toString());

  // should modify the call's statusCallback to add "inSayPlay" parameter
  const statusCallbackUrl = `https://${context.DOMAIN_NAME}/call/webhook?${serialize({
    ...event,
    inSayPlay: true,
  })}`;
  return updateCall(context, CallSid, twiml, statusCallbackUrl);
}

/*
 * This function should be called when a human has answered the call.
 * It starts asking for acknowledgment, or delivering the message depending on the configuration.
 */
async function callAnswered(context, event) {
  const { keyRequested } = event;
  let twiml;

  switch (keyRequested) {
    case KEY_REQUESTED.READ:
    case KEY_REQUESTED.CAN_REFUSE:
      // Gather press 1 to listen to your message or press 2 to ignore the call
      twiml = await startGather(context, event);
      break;

    case KEY_REQUESTED.NONE:
    default:
      // say/play the message
      twiml = await startSayPlay(context, event);
  }

  return twiml;
}

/*
 * This function should be called when keys has been received after a <Gather>
 * It checks which key has been pressed and proceeds with delivering the message or hanging up.
 */
async function gatherCallback(context, event) {
  const { keyRequested, Digits } = event;
  let twiml;
  // This is a callback from Gather
  if (Digits === KEYS.ACCEPT) {
    // Accepted call
    twiml = await startSayPlay(context, event);
  } else if (keyRequested === KEY_REQUESTED.CAN_REFUSE && Digits === KEYS.REFUSE) {
    // Refused call
    twiml = twimlHangUp();
  } else {
    // Wrong or no key, do the gather again!
    twiml = await startGather(context, event);
  }
  return twiml;
}

/*
 * This function is used to update /start of the status of the current call.
 * the /start function will then take action accordingly.
 */
function sendStatusUpdate(context, event, status) {
  const url = `https://${context.DOMAIN_NAME}/start`;
  console.log(`Sending status callback (${status}) to ${url}`);
  return post
    .postForm(url, {
      ...event,
      key: context.API_KEY,
      loopResult: status,
    })
    .then(() => {
      console.log(`status_callback (${status}) sent`);
      return true;
    })
    .catch((reason) => {
      console.log(`ERROR IN status_callback: ${reason}`);
      return false;
    });
}

exports.handler = async function handler(context, event, callback) {
  /**
   * Several callbacks are pointing to this function, we will use the parameters to find what to do.
   * call.create webhook -> provides CallStatus and AnsweredBy parameters
   * gather webhook -> provides Digits parameter
   */

  const { AnsweredBy, CallStatus, Digits, inSayPlay, inGather } = event;

  let twiml = null;

  if (CallStatus && CallStatus === 'completed' && inSayPlay) {
    // customer hung up while listening to the message
    console.log('Customer hung up while listening to the message ');
    await sendStatusUpdate(context, event, 'success');
  } else if (CallStatus && CallStatus === 'completed' && inGather) {
    // customer hung up without accepting the call
    console.log('Customer hung up or refused the call ');
    await sendStatusUpdate(context, event, 'call-refused');
  } else if (Digits) {
    // user entered some Digits when requested
    console.log('Gather Digits received');
    twiml = await gatherCallback(context, event);
  } else if (AnsweredBy && AnsweredBy === 'machine_start') {
    // call was answered by a voicemail
    console.log('Call was Answered by a machine!');
    await sendStatusUpdate(context, event, 'voicemail');
    twiml = twimlHangUp();
  } else if (CallStatus && ['busy', 'no-answer', 'canceled', 'failed'].indexOf(CallStatus) > -1) {
    // call was not answered
    console.log('Call was Not Answered');
    await sendStatusUpdate(context, event, CallStatus);
    twiml = twimlHangUp();
  } else if (CallStatus && CallStatus === 'in-progress') {
    // call was answered by a human!
    console.log('Call was Answered');
    twiml = await callAnswered(context, event);
  } else {
    // unknown case
    console.log('Unknown case for call webhook', event);
  }

  return callback(null, twiml);
};
