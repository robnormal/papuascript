var H = require('../helpers.js');
var lex = require('../lexer.js');
var B = require('../block_resolver.js');
var ID = 'IDENTIFIER', NUM = 'NUMBER', BR = 'TERMINATOR';

function getTokens(str) {
	var lexer = new lex.Lexer();
	return lexer.tokenize(str);
}

module.exports = {
	'Line.isUnindented detects when Line is closed by indentation': function(b, assert) {
		var
			l = B.Line('\t\t', 0, null),
			state = { rlevel: function() { return '\t'; } };

		assert.ok(l.isUnindented(state));
	},

	'Lines continue when new indented line present': function(b, assert) {
		var r = new B.Resolver(getTokens('t =\n\t4'));
	
		r.line();
		r.pos = 2;
		r.indent();

		assert.equal('\t', r.level, 'Resolver.level reflects current indentation');
		assert.equal('=', r.tag(), 'Drops INDENT token when found in Line');

		r.pos++;
		r.line();

		assert.equal(1, r.indentables.length, 'Does not add indented line as new Line');
		assert.equal('', r.dentable.level);
		assert.equal('\t', r.dentable.indent);

		r.pos++;
		r.outdent();
		assert.equal('', r.level, 'outdent() updates Resolver.level');
		assert.equal(0, r.indentables.length, 'Pops off Line when we outdent to Line.level');

		r.pos = r.tokens.length - 2; // last token but one; very last is always TERMINATOR
		assert.equal('NUMBER', r.tag(), 'Drops OUTDENT token when closing indented Line');
	},

	'Zero-length outdents are not dropped at the end of Lines': function(b, assert) {
		var r = new B.Resolver(getTokens('t = \\x -> x * x'));
		r.line();
		r.pos = 2; // \\
		r.block();
		r.pos = 4; // ->
		r.appendTag('INDENT'); // inserting zero-length INDENT
		r.pos = 5; // INDENT
		r.indent();
		r.pos = 6; // first x
		r.line();
		r.pos = 8; // last x
		r.appendTag('OUTDENT');
		r.pos = 9; // OUTDENT
		r.outdent();

		r.pos = 9;
		assert.equal('OUTDENT', r.tag());
		r.pos = 10;
		assert.equal('TERMINATOR', r.tag());

		r = new B.Resolver(getTokens('t = \\x -> \\y ->\n\tx * y'));
		r.line();
		r.pos = 2; // first \\
		r.block();
		r.pos = 4; // ->
		r.appendTag('INDENT'); // inserting zero-length INDENT
		r.pos = 5; // INDENT
		r.indent();
		assert.equal('INDENT', r.tag());
		r.pos = 6; // second \\
		r.block();
		r.pos = 9; // INDENT
		r.indent();
		assert.equal('INDENT', r.tag());
		r.pos = 10; // x
		r.line();
		r.pos = 13; // OUTDENT
		r.outdent();

		assert.equal('OUTDENT', r.tokens[13][0]);
		assert.equal('OUTDENT', r.tokens[14][0], 'Necessary OUTDENT added at end of Line');
		assert.equal(14, r.pos, 'moves _past_ inserted OUTDENTs, so we don\'t count them twice');

		r.pos = 15;
		assert.equal('TERMINATOR', r.tag());
	},

	'Blocks contain Lines': function(b, assert) {
		var r = new B.Resolver(getTokens('while x\n\tx--'));
		r.block();

		assert.ok(r.needsBlock(), 'When in unindented block, Resolver.needsBlock() is true');

		r.pos = 2; // INDENT
		r.indent();

		assert.ok(! r.needsBlock(), 'After indent, Resolver.needsBlock() is false');
		assert.ok('Block', r.dentable && r.dentable.type,
			'Block is added by block()');
		assert.equal('INDENT', r.tag(), 'INDENT is kept for Block');

		r.pos = 3; // second x
		r.line();

		assert.equal(2, r.indentables.length, 'Line is added to Resolver.indentables');
		assert.equal('Line', r.dentable.type, 'Line is pushed on top of containing Block');

		r.pos = 5; // OUTDENT
		r.outdent();

		assert.equal(0, r.indentables.length,
			'Resolver.level returns to Block.level, Block and its contents are popped');
		assert.equal('OUTDENT', r.tag(), 'OUTDENT is kept for Block');
	},

	'Line is popped when Resolver.pairs dips below Line.pairs': function(b, assert) {
		var toks = getTokens('a = b (c d) e');
		var r = new B.Resolver(toks);

		r.line();
		r.pos = 3;
		r.incrementPairs();
		r.line();

		assert.equal(2, r.indentables.length, 'Resolver.incrementPairs() pushes new Line on indentables');

		r.pos = 6;
		r.decrementPairs();

		assert.equal(1, r.indentables.length, 'Resolver.decrementPairs() pops Line off indentables');
	},

	'Blocks within a Line consume the rest of the Line': function(b, assert) {
		var toks = getTokens('t = \\x ->\n\tx * x');
		var r = new B.Resolver(toks);

		r.line();
		r.pos = 2; // \\
		r.block();

		assert.equal('Line', r.dentable.owner && r.dentable.owner.type,
			'Block is nested in Line it begins in');

		r.pos = 5; // INDENT
		r.indent();

		assert.equal('INDENT', r.tag(), 'INDENT kept for Block nested in Line');

		r.pos = 6; // x
		r.line();

		r.pos = 9; // OUTDENT

		r.outdent();
		assert.equal(0, r.indentables.length);
	},

	'When unindenting an Indentable, adds any needed OUTDENTs': function(b, assert) {
		var toks = getTokens('t = \\x -> \\y ->\n\tx * y');

		var r = new B.Resolver(toks);
		r.line();
		r.pos = 2; // first \\
		r.block();
		r.pos = 4; // first ->
		r.appendTag('INDENT'); // add INDENT that is not present
		r.indent();
		r.pos = 5; // second \\
		r.block();
		r.pos = 9; // existing INDENT
		r.indent();
		r.pos = 10; // x * y
		r.line();

		r.pos = 13; // existing OUTDENT
		r.outdent();
		r.pos = 14;

		assert.equal('OUTDENT', r.tag(), 'Adds needed OUTDENT when unindenting');
	},

	'When closing parens on an Indentable, adds any needed OUTDENTs': function(b, assert) {
		var toks = getTokens('t = (\\x ->\n\tx * x)');

		var r = new B.Resolver(toks);
		r.line();
		r.pos = 2; // (
		r.incrementPairs();
		r.pos = 3; // '|'
		r.block();
		r.pos = 6; // INDENT
		r.indent();
		r.pos = 7; // first 'x'
		r.line()
		r.pos = 10; // )

		r.decrementPairs();
		r.pos = 10; // should now be OUTDENT

		assert.equal('OUTDENT', r.tag(), 'adds OUTDENT when closing paren');
		r.pos = 11; // )
		assert.equal(')', r.tag());
	},

	'Keeps proper INDENTs and OUTDENTs in parens ': function(b, assert) {
		// t = (\x ->
		//     x * x
		//   ) y

		var toks = getTokens('t = (\\x ->\n\t\tx * x\n\t) y');
		var r = new B.Resolver(toks);

		r.line();
		r.pos = 2; // (
		r.incrementPairs();
		r.pos = 3; // \\
		assert.equal('\\', r.tag());
		r.block();
		r.pos = 6; // INDENT (\t\t)
		assert.equal('INDENT', r.tag());
		r.indent();
		r.pos = 7; // first 'x'
		assert.equal('IDENTIFIER', r.tag());
		r.line();

		r.pos = 10; // OUTDENT
		assert.equal('OUTDENT', r.tag());
		r.outdent();
		assert.equal('OUTDENT', r.tag(), 'keeps OUTDENT when unindenting past block\'s indent');

		r.pos = 11; // )
		assert.equal(')', r.tag());
		r.decrementPairs();

		r.pos = 13; // OUTDENT
		assert.equal('OUTDENT', r.tag());
		r.outdent();
		r.pos = 13;

		assert.equal('TERMINATOR', r.tag(), 'Drops OUTDENT for end of Line');
	},

	'fixBlocks() removes indents from Lines, keeps them for Blocks': function(b, assert) {
		// this should do all the steps in the previous test, and thus should
		// produce the same result

		var toks = getTokens('t = (\\x ->\n\t\tx * x\n\t) y');
		var r = new B.Resolver(toks);
		r.fixBlocks();

		assert.equal('OUTDENT', r.tokens[10][0]);
	}

};

