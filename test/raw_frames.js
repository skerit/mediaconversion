var assert  = require('assert'),
    libpath = require('path'),
    fs      = require('fs');

if (!global.MC) {
	global.MC = require('../index');
}

describe('Raw frames output', function() {

	var gray_count = 0,
	    gray_info,
	    rgb_info;

	this.timeout(0);
	this.slow(2000);

	it('should output each frame as a single buffer', function(done) {

		var conv = new MC.MediaConversion({debug: false}),
		    chunk_size,
		    chunk_info,
		    ended,
		    count = 0,
		    f = 0;

		let input = conv.addInput(fs.createReadStream(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4')));

		// This also tests multiple outputs!
		let output = conv.getRawFramesOutput(),
		    gray   = conv.getRawFramesOutput('gray');

		output.probeValue('chunk_size', function gotSizes(err, info) {
			chunk_info = info;
			rgb_info = info;
		});

		output.on('data', function onData(chunk) {
			count++;

			assert.equal(typeof chunk_info, 'object', 'Chunk info was not available on time');

			// Each chunk has to be the expected size!
			assert.equal(chunk.length, chunk_info.chunk_size, 'Chunk size did not match calculated size');
		});

		output.on('end', function onEnd() {
			assert.equal(count, 771, 'Decoded wrong amount of frames');
			finished();
		});

		gray.probeValue('chunk_size', function gotGraySizes(err, info) {
			gray_info = info;
		});

		gray.on('data', function onData(chunk) {
			gray_count++;
		});

		gray.on('end', function onEnd() {
			finished();
		});

		conv.start();

		function finished() {
			f++;

			if (f == 2) {
				done();
			}
		}
	});

	it('should set the output pixel format', function() {

		// The gray output has a depth of 1
		assert.equal(gray_info.depth, 1);

		// The chunksize of the gray output
		// should have been smaller than the RGB one
		assert.notEqual(rgb_info.chunk_size, gray_info.chunk_size);

		// The gray output should have as many frames as the RGB one
		assert.equal(gray_count, 771);
	});

});