const { path: postPath } = Runtime.getFunctions()['helpers/post'];
const post = require(postPath);
const { path: serializePath } = Runtime.getFunctions()['helpers/serialize'];
const { serialize } = require(serializePath);

exports.handler = async function handler(context, event, callback) {
  const twilioClient = context.getTwilioClient();
  const url = `https://${context.DOMAIN_NAME}/call/webhook?${serialize(event)}`;
  twilioClient.calls
    .create({
      to: event.to,
      from: event.from,
      machineDetection: 'Enable',
      url,
    })
    .then(() => {
      callback();
    })
    .catch((err) => {
      console.log('ERROR while issuing the call: ', err);
      post
        .postForm(`https://${context.DOMAIN_NAME}/start`, {
          ...event,
          loopResult: 'call-failed',
        })
        .then(() => {
          console.log('status callback (call-failed) sent');
          return true;
        })
        .catch((reason) => {
          console.log(`ERROR IN status callback: ${reason}`);
          return false;
        })
        .finally(() => {
          callback(null, err);
        });
    });
};
