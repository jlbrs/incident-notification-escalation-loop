exports.serialize = function serialize(obj) {
  const str = [];
  for (const key in obj)
    if (obj.hasOwnProperty(key)) {
      str.push(`${encodeURIComponent(key)}=${encodeURIComponent(obj[key])}`);
    }
  return str.join('&');
};
