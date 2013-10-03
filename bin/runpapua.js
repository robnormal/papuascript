#!/usr/bin/env node
var fs = require('fs');
var cproc = require('child_process');
var L = require('../lib/lexer.js');
var P = require('../lib/grammar.js');
var parser = P.parser;
parser.lexer = new L.Lexer();
parser.yy.parseError = function(msg, info) {
  throw new SyntaxError(msg + ' at column ' + (this.lexer.position() + 1));
};

var text = fs.readFileSync(process.argv[2], 'utf-8');
var res = parser.parse(text);
res.checkScope();

var file = process.argv[2] + '.js';
fs.writeFileSync(file, res.lines().toString());
cproc.spawn('node', [file], { stdio: 'inherit'});

