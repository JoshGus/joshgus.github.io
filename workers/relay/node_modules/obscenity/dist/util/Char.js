"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isHighSurrogate = isHighSurrogate;
exports.isLowSurrogate = isLowSurrogate;
exports.convertSurrogatePairToCodePoint = convertSurrogatePairToCodePoint;
exports.isWordChar = isWordChar;
exports.isDigit = isDigit;
exports.isAlphabetic = isAlphabetic;
exports.isLowerCase = isLowerCase;
exports.isUpperCase = isUpperCase;
exports.invertCaseOfAlphabeticChar = invertCaseOfAlphabeticChar;
exports.getAndAssertSingleCodePoint = getAndAssertSingleCodePoint;
function isHighSurrogate(char) {
    return 55296 /* CharacterCode.HighSurrogateStart */ <= char && char <= 56319 /* CharacterCode.HighSurrogateEnd */;
}
function isLowSurrogate(char) {
    return 56320 /* CharacterCode.LowSurrogateStart */ <= char && char <= 57343 /* CharacterCode.LowSurrogateEnd */;
}
// See https://unicodebook.readthedocs.io/unicode_encodings.html#utf-16-surrogate-pairs.
function convertSurrogatePairToCodePoint(highSurrogate, lowSurrogate) {
    return ((highSurrogate - 55296 /* CharacterCode.HighSurrogateStart */) * 0x400 +
        lowSurrogate -
        56320 /* CharacterCode.LowSurrogateStart */ +
        0x10000);
}
function isWordChar(char) {
    return isDigit(char) || isAlphabetic(char);
}
function isDigit(char) {
    return 48 /* CharacterCode.Zero */ <= char && char <= 57 /* CharacterCode.Nine */;
}
function isAlphabetic(char) {
    return isLowerCase(char) || isUpperCase(char);
}
function isLowerCase(char) {
    return 97 /* CharacterCode.LowerA */ <= char && char <= 122 /* CharacterCode.LowerZ */;
}
function isUpperCase(char) {
    return 65 /* CharacterCode.UpperA */ <= char && char <= 90 /* CharacterCode.UpperZ */;
}
// Input must be a lower-case or upper-case ASCII alphabet character.
function invertCaseOfAlphabeticChar(char) {
    return char ^ 0x20;
}
// Asserts that the string is comprised of one and only one code point,
// then returns said code point.
function getAndAssertSingleCodePoint(str) {
    if ([...str].length !== 1)
        throw new RangeError(`Expected the input string to be one code point in length.`);
    return str.codePointAt(0);
}
