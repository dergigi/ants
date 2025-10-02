// Test the BY_TOKEN_REGEX with the query from the screenshot
const BY_TOKEN_REGEX = /(^|\s)by:([^\s),.;]+)(?=[\s),.;]|$)/gi;

const query = "by:_@dergigi.com";

BY_TOKEN_REGEX.lastIndex = 0;
let match;
while ((match = BY_TOKEN_REGEX.exec(query)) !== null) {
  // debug output removed
}
