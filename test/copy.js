var assert = require('assert'),
    libpath = require('path');

if (!global.MC) {
	global.MC = require('../index');
}

describe('Converting files with equal input codec', function() {
	this.slow(1600);
	this.timeout(0);

	it('should copy the source if it is the same codec', function(done) {
		var conv = new MC.MediaConversion({debug: false}),
		    ended;

		let input = conv.addInput(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4'));

		input.setCopyTs();

		// Tell it the video codec, so it doesn't need to probe the stream
		input.setVideoCodec('h264');

		// This shouldn't happen, because we manually set the h264
		input.on('probed', function wasProbed(result, probe) {
			throw new Error('Input was probed even though a codec was given');
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
			assert.equal(total > 2069000 && total < 3269000, true, 'The output stream was not the right size: ' + total);

			assert.equal(ended, true, 'The output stream has not ended yet');

			done();
		});

		conv.start();
	});

	it('should detect the type before encoding if it is not supplied manually', function(done) {
		var conv = new MC.MediaConversion({debug: false}),
		    ended,
		    count = 0;

		let input = conv.addInput(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4'));

		input.setCopyTs();

		input.on('probed', function wasProbed(result, probe) {
			assert.equal(result.video.codec_name, 'h264');
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

	it('should know about an output stream\'s type when re-encoding', function(done) {

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

		let reconv = new MC.MediaConversion({debug: false});

		let reinput = reconv.addInput(output);

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
			assert.equal(retotal > 2069000 && retotal < 3269000, true, 'The output stream was not the right size: ' + retotal + ' bytes. It has probably been reencoded.');

			doDone('reconv-end');
		});

		reconv.start();
	});

	it('should disable copy when different output pixel format is set', function noCopyWhenPixFmt(done) {

		var conv = new MC.MediaConversion({debug: false});

		let input = conv.addInput(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4'));
		let output = conv.getRawFramesOutput();

		let total = 0;

		let second = new MC.MediaConversion({debug: false});

		let sinput = second.addInput(output);
		let soutput = second.getRawFramesOutput('gray');

		soutput.on('data', function onData(c) {
			total += c.length;
		});

		// output result  : 236481120
		// soutput result : 78827040

		soutput.resume();

		soutput.on('end', function onEnd() {
			assert.equal(total, 78827040, 'Second output was not reencoded, byte size was ' + total);
			done();
		});

		conv.start();
		second.start();
	});

	it('should disable copy when filters are used', function noCopyWhenFiltering(done) {
		this.slow(2500);

		var conv = new MC.MediaConversion({debug: false});

		let input = conv.addInput(libpath.resolve(__dirname, '..', 'samples', 'CEP389_512kb.mp4'));
		let output = conv.getRawFramesOutput();

		let total = 0;

		let second = new MC.MediaConversion({debug: false});

		let sinput = second.addInput(output);
		let soutput = second.getRawFramesOutput('gray');
		soutput.setFilter('boxblur', '2:1');

		soutput.on('data', function onData(c) {
			total += c.length;
		});

		// output result  : 236481120
		// soutput result : 78827040

		soutput.resume();

		soutput.on('end', function onEnd() {
			assert.equal(total, 78827040, 'Second output was not reencoded, byte size was ' + total);
			done();
		});

		conv.start();
		second.start();
	});
});