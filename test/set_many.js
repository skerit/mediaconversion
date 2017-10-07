var assert  = require('assert'),
    libpath = require('path'),
    fs      = require('fs');

if (!global.MC) {
	global.MC = require('../index');
}

describe('Setting many options', function() {
	this.slow(1000);

	it('should be set on the input and output', function(done) {
		var conv = new MC.MediaConversion({debug: false}),
		    ended,
		    count = 0;

		let input = conv.addInput(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4'));

		input.setMany({
			copy_ts     : true,
			video_codec : 'h264',
		});

		// This shouldn't happen, because we manually set the h264
		input.on('probed', function wasProbed(result, probe) {
			throw new Error('Input was probed even though a codec was given');
		});

		let output = conv.addOutput();

		output.setMany({
			format      : 'mpegts',
			video_codec : 'libx264',
			arguments   : [
				'-bsf:v',
				'h264_mp4toannexb'
			]
		});

		let total = 0,
		    start = Date.now();

		output.on('data', function onData(chunk) {
			total += chunk.length;
		});

		output.on('end', function onEnd() {
			ended = true;
		});

		conv.on('end', function onEnd(err) {

			if (err) {
				throw err;
			}

			// Since we don't do any encoding, the size should be about the same
			// (Save for transport tream format changes)
			assert.equal(total > 2069000 && total < 3269000, true, 'The output stream was not the right size: ' + total);

			assert.equal(ended, true, 'The output stream has not ended yet');

			done();
		});

		conv.start();
	});
});