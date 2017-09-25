var assert = require('assert');

describe('Basic behaviour', function() {
	this.slow(500);

	it('should require the MediaConversion namespace', function() {
		global.MC = require('../index');

		assert.equal(typeof MC.MediaConversion, 'function');
	});

});