var
	H = require('./helpers.js'),
	$ = require('underscore');

function Dent(sign, text) {
	this.sign = sign;
	this.text = text;

	if (typeof this.text !== 'string') {
		throw new Error();
	}
}
function Indent(text) {
	return new Dent(1, text);
}
function Outdent(text) {
	return new Dent(-1, text);
}
function EmptyDent(text) {
	return new Dent(0, '');
}


$.extend(Dent.prototype, {
	isIndent: function() {
		return 1 === this.sign;
	},
	isOutdent: function() {
		return -1 === this.sign;
	},
	isEmpty: function() {
		return 0 === this.sign;
	},

	equals: function(dent) {
		return this.sign === dent.sign && this.text === dent.text;
	},

	isNegationOf: function(dent) {
		return this.sign = -dent.sign && this.text === dent.sign;
	},

	greaterStartThan: function(dent) {
		if (this.text === dent.text) {
			return false;
		} else if (H.begins_with(this.text, dent.text)) {
			return true;
		} else if (! H.begins_with(dent.text, this.text)) {
			throw new Error('Indent mismatch');
		}
	},

	lessStartThan: function(dent) {
		return this.text !== dent.text && ! this.greaterStartThan(dent);
	},

	greaterEndThan: function(dent) {
		if (this.text === dent.text) {
			return false;
		} else if (H.ends_with(this.text, dent.text)) {
			return true;
		} else if (! H.ends_with(dent.text, this.text)) {
			throw new Error('Indent mismatch');
		}
	},

	before: function(dent) {
		if (this.isEmpty()) {
			return dent;
		} else if (dent.isEmpty()) {
			return this;
		} else if (this.isIndent()) {

			if (dent.isIndent()) {
				return Indent(this.text + dent.text);

			// dent must be Outdent
			} else if (this.text === dent.text) {
				return EmptyDent();
			} else if (this.greaterEndThan(dent)) {
				return Indent(H.clipEnd(this.text, dent.text));
			} else if (dent.greaterEndThan(this)) {
				return Outdent(H.clipEnd(dent.text, this.text));
			} else {
				throw new Error('Indent mismatch');
			}

		} else {

			if (dent.isOutdent()) {
				return Outdent(dent.text + this.text);
			} else if (this.text === dent.text) {
				return EmptyDent();
			} else if (this.greaterStartThan(dent)) {
				return Outdent(H.clipStart(this.text, dent.text));
			} else if (dent.greaterStartThan(this)) {
				return Indent(H.clipStart(dent.text, this.text));
			} else {
				throw new Error('Indent mismatch');
			}
		}
	},

	after: function(dent) {
		return dent.before(this);
	},
	negate: function() {
		return new Dent(-this.sign, this.text);
	}
});

var dentize = function(token) {
	if ('INDENT' === token[0]) {
		return Indent(token[1]);
	} else if ('OUTDENT' === token[0]) {
		return Outdent(token[1]);
	} else {
		return EmptyDent();
	}
};

module.exports = {
	Indent: Indent,
	Outdent: Outdent,
	EmptyDent: EmptyDent,
	dentize: dentize
};

