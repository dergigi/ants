// Test the BY_TOKEN_REGEX with the query from the screenshot
const BY_TOKEN_REGEX = /(^|\s)by:([^\s),.;]+)(?=[\s),.;]|$)/gi;

const query = "by:_@dergigi.com";
console.log('Testing regex with query:', query);

BY_TOKEN_REGEX.lastIndex = 0;
let match;
while ((match = BY_TOKEN_REGEX.exec(query)) !== null) {
  console.log('Match found:', match);
  console.log('Full match:', match[0]);
  console.log('Prefix:', match[1]);
  console.log('Token:', match[2]);
}
