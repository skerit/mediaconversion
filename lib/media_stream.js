var Stream = require('stream'),
    Blast = require('protoblast')(false),
    Obj = Blast.Bound.Object,
    Fn = Blast.Bound.Function;

/**
 * MediaStream:
 * Custom output streams
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   options
 */
var MediaStream = Fn.inherits(Stream.Transform, 'Develry.MediaConversion', function MediaStream(options) {
	MediaStream.super.call(this, options);

	// Store options for later
	this.options = options;
});

/**
 * The MediaStream from which we got our data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setProperty('data_parent_stream', null);

/**
 * The original MediaConversion instance
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setProperty(function media_conversion() {

	if (this._media_conversion) {
		return this._media_conversion;
	}

	if (this.data_parent_stream) {
		return this.data_parent_stream.media_conversion;
	}
}, function set_media_conversion(value) {
	this._media_conversion = value;
});

/**
 * Media probe data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setProperty(function media_probe() {

	if (this._media_probe) {
		return this._media_probe;
	}

	if (this.data_parent_stream) {
		return this.data_parent_stream.media_probe;
	}
}, function set_media_probe(val) {
	this._media_probe = val;
});

/**
 * Media codec data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setProperty(function media_codec() {

	if (this._media_codec) {
		return this._media_codec;
	}

	if (this.data_parent_stream) {
		return this.data_parent_stream.media_codec;
	}
}, function set_media_codec(val) {
	this._media_codec = val;
});

/**
 * MSE data
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setProperty(function media_mse() {

	if (this._media_mse) {
		return this._media_mse;
	}

	if (this.data_parent_stream) {
		return this.data_parent_stream.media_mse;
	}
}, function set_media_mse(val) {
	this._media_mse = val;
});

/**
 * Create an instance of the same class with the same data,
 * but not with the same stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 *
 * @param    {Object}   options
 *
 * @return   {MediaStream}
 */
MediaStream.setMethod(function cloneWithData(options) {

	var result;

	options = Obj.assign({}, this.options, options);

	result = new this.constructor(options);

	// Indicate this is the parent
	result.data_parent_stream = this;

	return result;
});

/**
 * Probe for a value in the stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setMethod(function probeValue(name, callback) {

	if (this.data_parent_stream) {
		return this.data_parent_stream.probeValue(name, callback);
	}

	callback(new Error('There is no data parent stream, cannot execute probeValue'));
});

/**
 * Transform the stream
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setMethod(function _transform(chunk, encoding, callback) {
	this.push(chunk);
	callback();
});

/**
 * Get output codec data
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setMethod(function getCodecData(callback) {

	var that = this;

	Blast.nextTick(function onNextTick() {

		if (that.media_codec) {
			return callback(null, that.media_codec);
		}

		if (!that.media_conversion) {
			return callback();
		}

		that.media_codec = that.media_conversion.getOutputCodecData();

		if (!that.media_codec) {
			console.log('Gonna wait for encode options...');
			that.media_conversion.afterOnce('encode_options', function gotEncodeOptions() {
				console.log('Wait over!')
				that.getCodecData(callback);
			});

			return;
		}

		callback(null, that.media_codec);
	});
});

/**
 * Get the MSE codec type
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    1.0.0
 * @version  1.0.0
 */
MediaStream.setMethod(function getMseType(callback) {

	var that = this;

	if (this.media_mse) {
		return Blast.nextTick(function onNextTick() {
			callback(null, that.media_mse);
		});
	}

	let video_profile,
	    audio_profile,
	    format,
	    audio,
	    video;

	Fn.parallel(function getVideo(next) {
		that.probeValue('video_codec', function gotVideo(err, result) {
			video = result;
			next(err);
		});
	}, function getAudio(next) {
		that.probeValue('audio_codec', function gotAudio(err, result) {
			audio = result;
			next(err);
		});
	}, function getFormat(next) {
		that.probeValue('format', function gotFormat(err, result) {
			format = result;
			next(err);
		});
	}, function done(err) {

		if (err) {
			return callback(err);
		}

		let type = 'video/' + format + '; codecs="';

		// Now add the video codec
		switch (video) {
			case 'libx264':
			case 'h264':
				type += 'avc1.'

				// @TODO: GET PROFILE!
				if (video_profile == 'high') {
					// High 3.1
					type += '64001f';
				} else {
					// Baseline 3.0
					type += '42001e';
				}

				break;

			case 'libvpx':
			case 'webm':
				type += 'vp8';
				break;
		}

		if (audio) {
			type += ',';

			switch (audio) {
				case 'aac':
					if (audio_profile == 'lc') {
						// AAC-LC
						type += 'mp4a.40.2';
					} else {
						// HE-AAC
						type += 'mp4a.40.5';
					}
					break;
			}
		}

		that.media_mse = type;
		callback(null, type);
	});
});

module.exports = MediaStream;