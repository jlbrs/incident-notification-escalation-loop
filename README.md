# incident-calls-notification

This application is a backend script that opens an API to run a series of phone calls on request.
This is aimed at supervision systems, in order to notify a list of on-call peoples when some incident occurs.

The project is described in a blog article: https://www.twilio.com/blog/incident-notification-escalation-loop-programmable-voice

## Deployment and Base URL

1. Clone this repository and navigate to the right folder.

2. Make sure you have installed and configured [twilio-cli](twilio-cli":"https://www.twilio.com/docs/twilio-cli/quickstart) and the [serverless toolkit](https://www.twilio.com/docs/labs/serverless-toolkit/getting-started).

3. Copy or rename `.env.sample` into `.env`, then fill-in the different variables as documented in the file in order to configure your environment.  

4. Deploy this application onto your Twilio account using the following command:
```shell
twilio serverless:deploy
``` 

The command will provide you with the URL (example: `Domain: incident-calls-notification-1234-dev.twil.io`). This is your Base URL for calling the API below. 

## API

### URL 

```url
{BASE URL}/start
```

### Method

This service deploys to Twilio Functions, which supports HTTP `POST` and `GET` methods.

As stated in [the documentation](https://www.twilio.com/docs/runtime/functions/request-flow#supported-requests), `POST` parameters can be sent as `application/json` or `application/x-www-form-urlencoded`.  

### Parameters

* `numbers`: (required) list of e164 phone numbers to call and number of attempts for each. Example: 
```jsonc
[
        {
            "number": "+44xxxxxxxxx", // string - e164 phone number
            "attempts": 2, // integer - Number of attempts to call the number
        },
        {
            "number": "+33xxxxxxxxxxx",
            "attempts": 2
        },
        ...
]
```
* `from`: (string - required) e164 caller id to call above numbers from. 
  
* `textToSay`: (string - optional) text to read when someone answers and accepts the call

* `textLanguage`: (string - optional) language in which the text is read. List at https://www.twilio.com/docs/voice/twiml/say#attributes-language

* `textVoice`: (string - optional) voice used to read the text. List at https://www.twilio.com/docs/voice/twiml/say#voice

* `playFileUrl`: (string - optional, required if `textToSay` is not provided) url to a sound file to play when someone answers the call. Will not be used if `textToSay` is set. Note: you can deploy the sound file on [Twilio assets](https://support.twilio.com/hc/en-us/articles/360019105433-Getting-Started-with-Twilio-Assets) for convenience.  

* `keyRequested`: (`read`, `canRefuse`, `none` - optional - default `none`) ask the person answering the call to press 1 to acknowledge and hear the message, or (using the `canRefuse` option) press 2 to refuse the call. 

* `keyRequestTextToSay`: (string - optional) text to read when someone answers the call to request to press 1 to hear the message (or 2 to refuse it when `canRefuse` is selected).

* `keyRequestFileUrl`: (string - optional) url to a sound file to play when someone answers the call to request to press 1 to receive the message (or 2 to refuse it when `canRefuse` is selected).
  Note: you can deploy the sound file on [Twilio assets](https://support.twilio.com/hc/en-us/articles/360019105433-Getting-Started-with-Twilio-Assets) for convenience.
  
* `callbackUrl`: (url - optional) if set, the application will POST the loop result to this url. Object sent is: 
```jsonc
{
  "callAccepted": true, // boolean - someone in the list heard the message or not
  "callAcceptedBy": "+44xxxxxxxxx" // string or null - phone number of the callee who heard the message, or null if call was not accepted by anyone.
}
```

* `key`: (string - required) API Key as specified in your `.env` file. 

## Process

![Process Flow](IncidentEscalationLoop.svg)

## Test
You can test with the curl commands (to be updated with your account "from" and your phone numbers)

```shell
curl --location --request POST 'https://{BASE URL}/start' \
--header 'Content-Type: application/x-www-form-urlencoded' \
--data-urlencode 'numbers=[
        {
            "number": "+44xxxxxxxxx",
            "attempts": 1
        },
        {
            "number": "+33xxxxxxxxxxx",
            "attempts": 2
        },
        {
            "number": "+34xxxxxxxxxxx",
            "attempts": -1
        }]' \
--data-urlencode 'textToSay=bonjour' \
--data-urlencode 'textLanguage=English' \
--data-urlencode 'textVoice=man' \
--data-urlencode 'playFileUrl=https://my.audio.file1' \
--data-urlencode 'keyRequested=canRefuse' \
--data-urlencode 'keyRequestTextToSay=bonjour2' \
--data-urlencode 'keyRequestFileUrl=https://my.audio.file2' \
--data-urlencode 'from=+123456789' \
--data-urlencode 'callbackUrl=https://my.system.url/callback' \
--data-urlencode 'key=YourOwnKey'
```

