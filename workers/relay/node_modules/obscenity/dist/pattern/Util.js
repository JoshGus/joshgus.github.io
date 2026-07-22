"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.potentiallyMatchesEmptyString = potentiallyMatchesEmptyString;
exports.compilePatternToRegExp = compilePatternToRegExp;
exports.getRegExpStringForNode = getRegExpStringForNode;
const Nodes_1 = require("./Nodes");
function potentiallyMatchesEmptyString(pattern) {
    return pattern.nodes.every((node) => node.kind === Nodes_1.SyntaxKind.Optional);
}
function compilePatternToRegExp(pattern) {
    let regExpStr = '';
    if (pattern.requireWordBoundaryAtStart)
        regExpStr += '\\b';
    for (const node of pattern.nodes)
        regExpStr += getRegExpStringForNode(node);
    if (pattern.requireWordBoundaryAtEnd)
        regExpStr += `\\b`;
    return new RegExp(regExpStr, 'gs');
}
const regExpSpecialChars = ['[', '.', '*', '+', '?', '^', '$', '{', '}', '(', ')', '|', '[', '\\', ']'].map((str) => str.charCodeAt(0));
function getRegExpStringForNode(node) {
    switch (node.kind) {
        case Nodes_1.SyntaxKind.Literal: {
            let str = '';
            for (const char of node.chars) {
                if (regExpSpecialChars.includes(char))
                    str += '\\';
                str += String.fromCodePoint(char);
            }
            return str;
        }
        case Nodes_1.SyntaxKind.Optional:
            return `(?:${getRegExpStringForNode(node.childNode)})?`;
        case Nodes_1.SyntaxKind.Wildcard:
            return `.`;
    }
}
