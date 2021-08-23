const postPath = Runtime.getFunctions()['helpers/post'].path;
const post = require(postPath);
const debug = require('debug')('start:debug');
const TwilioWebhookDispatch = require('twilio-webhook-dispatch');

const { log } = console;

function validateParameters(parameters, context) {
  const { numbers, from, textToSay, playFileUrl, key } = parameters;
  const result = { valid: true };

  if (!key || key !== context.API_KEY) {
    result.errorMessage = 'Invalid key';
  }
  delete parameters.key;

  if (!textToSay && !playFileUrl) {
    result.errorMessage = 'Missing parameter: textToSay or playFileUrl';
  }

  if (!from) {
    result.errorMessage = 'Missing parameter: from';
  }

  if (numbers) {
    try {
      JSON.parse(numbers);
    } catch (e) {
      result.errorMessage = 'Incorrectly formatted parameter: numbers';
      debug(e);
    }
  } else {
    parameters.numbers = '[]';
  }

  result.valid = typeof result.errorMessage !== 'string';
  debug(`validateParameters: ${JSON.stringify(result)}`);
  return result;
}

function feedback(callbackUrl, whoTookTheCall) {
  return post
    .postJson(callbackUrl, {
      callAccepted: whoTookTheCall !== null,
      callAcceptedBy: whoTookTheCall,
    })
    .then(() => {
      console.log(`FEEDBACK SENT TO ${callbackUrl}. Call accepted by: ${whoTookTheCall}`);
      return true;
    })
    .catch((reason) => {
      console.log(`ERROR IN FEEDBACK: ${reason}`);
      return false;
    });
}

// eslint-disable-next-line consistent-return
exports.handler = async function handler(context, event, callback) {
  // setup a response object
  const response = new Twilio.Response();
  response.appendHeader('Access-Control-Allow-Origin', '*');
  response.appendHeader('Access-Control-Allow-Methods', 'OPTIONS POST');
  response.appendHeader('Content-Type', 'application/json');
  response.appendHeader('Access-Control-Allow-Headers', 'Content-Type');

  const validateParametersResult = validateParameters(event, context);

  const { numbers, callbackUrl, loopResult } = event;
  let { to } = event;

  if (loopResult === 'success') {
    // Incident notification succesfull
    if (callbackUrl) {
      await feedback(callbackUrl, to);
    }
    return callback(null, '');
  }

  if (!validateParametersResult.valid) {
    response.setStatusCode(400);
    response.setBody(validateParametersResult.errorMessage);
    return callback(null, response);
  }

  const numberList = JSON.parse(numbers);
  debug('Escalation list: ', JSON.stringify(numberList));

  // Find who to call
  while (true) {
    // Check if there is someone to call
    if (numberList.length <= 0) {
      await feedback(callbackUrl, null);
      response.setBody('Loop is over');
      return callback(null, response);
    }

    // Check if there are still some attempts remaining
    if (numberList[0].attempts <= 0) {
      numberList.shift();
      continue;
    }

    to = numberList[0].number;
    log(`Number to call: ${to}. Remaining attempt(s): ${numberList[0].attempts}`);
    numberList[0].attempts -= 1;

    // Check if there are still some attempts remaining
    if (numberList[0].attempts <= 0) {
      numberList.shift();
    }

    break;
  }

  // initiate the call with all the parameters and callback if current call fails
  const url = `https://${context.DOMAIN_NAME}/call/start`;
  log(`Calling ${url} to start the call to ${to}`);

  TwilioWebhookDispatch(
    context,
    {
      ...event,
      to,
      numbers: JSON.stringify(numberList),
    },
    url,
  )
    .then(() => {
      console.log('call starting to ', to);
      response.setBody(`call starting to ${to}`);
      return callback(null, response);
    })
    .catch((reason) => {
      console.error(reason);
      response.setStatusCode(500);
      response.setBody(`Error : ${reason}`);
      return callback(500, `Error calling post to call/start endpoint. Status: ${reason}`);
    });
};
