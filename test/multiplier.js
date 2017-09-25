var assert  = require('assert'),
    libpath = require('path'),
    fs      = require('fs');

if (!global.MC) {
	global.MC = require('../index');
}

describe('Input stream multiplier/forker', function() {
	this.slow(1000);

	it('should multiply the incoming source to determine its codec', function(done) {
		var conv = new MC.MediaConversion({debug: false}),
		    ended,
		    count = 0;

		let input = conv.addInput(fs.createReadStream(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4')));

		input.setCopyTs();

		input.on('probed', function wasProbed(result, probe) {
			result.video.codec_name == 'h264';
			doDone();
		});

		let output = conv.addOutput();

		output.setVideoCodec('libx264');
		output.setFormat('mpegts');

		// We need to set bsf:v in order to copy this stream
		output.addArguments('-bsf:v', 'h264_mp4toannexb');

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
			assert.equal(total > 2069000 && total < 3269000, true, 'The output stream was not the right size');

			assert.equal(ended, true, 'The output stream has not ended yet');

			doDone();
		});

		conv.start();

		function doDone() {
			count++;
			if (count == 2) {
				done();
			}
		}
	});

	it('should keep a copy of the originating source', function(done) {

		var conv = new MC.MediaConversion({debug: false}),
		    ended,
		    count = 0;

		let input = conv.addInput(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4'));

		input.setCopyTs();

		input.on('probed', function wasProbed(result, probe) {
			assert.equal(result.video.codec_name, 'h264');
			doDone('input-probed');
		});

		let output = conv.addOutput();

		output.setVideoCodec('libx264');
		output.setFormat('mpegts');

		// We need to set bsf:v in order to copy this stream
		output.addArguments('-bsf:v', 'h264_mp4toannexb');

		let total = 0,
		    start = Date.now();

		output.on('data', function onData(chunk) {
			total += chunk.length;
		});

		output.on('end', function onEnd() {
			ended = true;
			doDone('output-end');
		});

		conv.on('end', function onEnd(err) {

			if (err) {
				throw err;
			}

			// Since we don't do any encoding, the size should be about the same
			// (Save for transport tream format changes)
			assert.equal(total > 2069000 && total < 3269000, true, 'The output stream was not the right size');
			doDone('conv-end');
		});

		conv.start();

		function doDone(type) {
			count++;

			//console.log(' -- DONE', count, type)

			if (count == 5) {
				done();
			}
		}

		let multiplier = new MC.StreamMultiplier(output);
		let fork = multiplier.fork();

		let reconv = new MC.MediaConversion({debug: false});

		let reinput = reconv.addInput(fork);

		// This shouldn't happen, because we manually set the h264
		reinput.on('probed', function wasProbed(result, probe) {
			throw new Error('Input was probed even though a codec should have been inferred from the output');
		});

		reinput.setCopyTs();
		let reoutput = reconv.addOutput();

		reoutput.setVideoCodec('libx264');
		reoutput.setFormat('mpegts');

		let retotal = 0,
		    reended;

		reoutput.on('data', function onData(chunk) {
			retotal += chunk.length;
		});

		reoutput.on('end', function onEnd() {
			reended = true;
			doDone('reoutput-end');
		});

		reconv.on('end', function onEnd(err) {

			if (err) {
				throw err;
			}

			// Since we don't do any encoding, the size should be about the same
			// (Save for transport tream format changes)
			assert.equal(retotal > 2069000 && retotal < 3269000, true, 'The output stream was not the right size');

			doDone('reconv-end');
		});

		reconv.start();
	});
});