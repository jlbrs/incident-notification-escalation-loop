const axios = require('axios');
const qs = require('qs');

exports.postForm = function postForm(url, data) {
  // console.log("Calling " + data);
  const body = qs.stringify(data);
  const config = {
    method: 'post',
    url,
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    data: body,
  };

  return axios(config);
};

exports.postJson = function postJson(url, data) {
  // console.log("Calling " + url, data);
  const config = {
    method: 'post',
    url,
    data,
  };

  return axios(config);
};
