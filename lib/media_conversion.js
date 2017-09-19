var ChildProcess       = require('child_process'),
    libpath            = require('path'),
    mkdirp             = require('mkdirp'),
    MediaProbe         = require('./media_probe'),
    StreamMultiplier   = require('./stream_multiplier'),
    PassThrough        = require('stream').PassThrough,
    MjpegExtractor     = require('./mjpeg_extractor'),
    Blast              = require('protoblast')(false),
    Obj                = Blast.Bound.Object,
    Fn                 = Blast.Bound.Function,
    fs                 = require('fs');

/**
 * The MediaConversion Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 */
var Conversion = Fn.inherits('Informer', 'Develry', function MediaConversion(settings) {

	if (!settings) {
		settings = {};
	}

	// The original settings
	this.settings = settings;

	// Make it live?
	this.make_it_live = settings.make_it_live;
});

/**
 * The input stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Stream}
 */
Conversion.setProperty('input', null);

/**
 * The output stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Stream}
 */
Conversion.setProperty('output', null);

/**
 * The ffmpeg process
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {ChildProcess}
 */
Conversion.setProperty('process', null);

/**
 * Has this media conversion been stopped deliberately?
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {ChildProcess}
 */
Conversion.setProperty('stopped', null);

/**
 * The remuxer process
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {ChildProcess}
 */
Conversion.setProperty('remuxer', null);

/**
 * The niceness level
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Number}
 */
Conversion.setProperty('niceness', 19);

/**
 * Path to webmremux binary
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {String}
 */
Conversion.setProperty('webmremux', null);

/**
 * Info on the input stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Object}
 */
Conversion.setProperty('probe_result', null);

/**
 * The input video type
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {String}
 */
Conversion.setProperty('video_info', null);

/**
 * Is audio enabled?
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Boolean}
 */
Conversion.setProperty('audio_enabled', true);

/**
 * Normalized options
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.1
 *
 * @type     {Object}
 */
Conversion.setProperty('normalized_options', null);

/**
 * Available profiles
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic('profiles', {});

/**
 * Realtime default options
 * (applied before regular default options)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic('realtime_defaults', {

	// Use a buffer so the bitrate is kept in check
	bufsize    : '128k',

	// Deadline isn't used by every codec, but set it anyway
	deadline   : 'realtime',

	// Same for preset
	preset     : 'ultrafast',

	// Use less threads to not tax the system too much
	threads    : 2
});

/**
 * Default options (after processing profile)
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic('defaults', {

	// Probe the stream, if codecs match
	// don't do any encoding
	allow_copy  : true,

	// Copy the timestamp
	copyts      : true,

	// Default working directory id
	dirid       : 'def',

	// Don't specify a duration
	duration    : null,

	// Don't force encoding by default
	force_audio_encode: false,
	force_video_encode: false,
	
	// Don't force probing the video by default
	force_probe : false,

	// Use pipe input
	input       : 'pipe:0',

	// Do a single pass by default (other values are 1 or 2)
	pass        : null,

	// Don't use a start time
	start       : null,

	// Don't be too strict, don't quit on experimental arguments
	strict      : -2,

	// Use up to 6 threads
	threads     : 6
});

/**
 * Probe a stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic(function probe(stream) {
	var probe = new MediaProbe();

	probe.setStream(stream);

	return probe;
});

/**
 * Register a profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setStatic(function registerProfile(name, fnc) {

	if (typeof name == 'function') {
		fnc = name;
		name = fnc.name;
	}

	this.profiles[name] = fnc;
});

/**
 * Create another conversion instance with the same settings
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function startNew(output, options) {

	var result = new this.constructor();

	result.input = this.input;
	result.normalized_options = this.normalized_options;
	result.encode_options = this.encode_options;
	result.probe_result = this.probe_result;

	if (arguments.length) {
		result.start(output, options);
	}

	return result;
});

/**
 * Create a simple passthrough stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function createStream() {

	var result = new PassThrough();

	return result;
});

/**
 * Create an MjpegExtractor stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 */
Conversion.setMethod(function createMjpegExtractor(options) {

	var result = new MjpegExtractor(options);

	return result;
});

/**
 * Set the niceness of the conversion
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function renice(niceness) {

	var args;

	if (this.niceness == niceness) {
		return;
	}

	if (typeof niceness == 'number') {
		this.niceness = niceness;
	}

	if (!this.process) {
		return;
	}

	args = [this.niceness, '-p', this.process.pid];
	ChildProcess.execFile('/usr/bin/renice', args);
});

/**
 * Normalize options
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function normalizeOptions(options) {

	// Make sure options is a regular object
	if (!Obj.isPlainObject(options)) {
		options = {};
	}

	// Make sure there is an extra args array
	if (!Array.isArray(options.extra_args)) {
		options.extra_args = [];
	}

	// If a profile was given, run it through that option normalizer function
	if (options.profile && this.constructor.profiles[options.profile]) {
		options = this.constructor.profiles[options.profile](options);
	}

	// Apply realtime defaults first
	if (options.realtime) {
		options = Obj.merge({}, this.constructor.realtime_defaults, options);
	}

	// Now apply the regular defaults
	options = Obj.merge({}, this.constructor.defaults, options);

	// Now set the options checksum
	options.checksum = Obj.checksum(options);

	// Set the passlogfile
	if (options.pass) {
		options.pass_prefix = 'ffpass-' + options.checksum;
	}

	return options;
});

/**
 * Enable/disable audio
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function enableAudio(value) {

	if (value == null) {
		value = true;
	}

	this.audio_enabled = value;
});

/**
 * Create an argument array
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function createArgs(options) {

	var pass_args = [],
	    args = [];

	if (!options) {
		options = this.encode_options;
	}

	// Native framerate uses '-re' and the wallclock option,
	// but most people probably don't need this
	if (options.native_framerate) {
		args.push('-re');
		args.push('-use_wallclock_as_timestamps', '1');
	} else if (options.variable_framerate) {
		args.push('-use_wallclock_as_timestamps', '1');
	}

	if (options.input_type) {

		// Don't set v4l if it's a pipe input
		if (options.input == 'pipe:0' && options.input_type == 'v4l2') {
			// Don't set it
		} else {
			args.push('-f', options.input_type);
		}
	}

	// Start with the pipe input
	args.push('-i', options.input);

	// See if there is a second input
	if (this.second_input) {
		args.push('-i', this.second_input);
	}

	// Add the strict value
	if (options.strict != null) {
		args.push('-strict', options.strict);
	}

	// Add extra arguments
	if (options.extra_args && options.extra_args.length) {
		args.push.apply(args, options.extra_args);
	}

	// Allow copying of the timestamp?
	if (options.copyts) {
		args.push('-copyts');
	}

	// Add seek options
	if (options.start) {
		args.push('-ss', options.start);
	}

	// Add wanted duration
	if (options.duration) {
		args.push('-t', options.duration);
	}

	if (options.threads) {
		args.push('-threads', options.threads);
	}

	if (options.do_video_copy) {
		args.push('-codec:v', 'copy');

		if (options.video_bsf) {
			args.push('-bsf:v', options.video_bsf);
		}

	} else {
		if (options.cpu_used != null) {
			args.push('-cpu-used', options.cpu_used);
		}

		if (options.bufsize) {
			args.push('-bufsize', options.bufsize);
		}

		if (options.preset) {
			args.push('-preset', options.preset);
		}

		if (options.deadline) {
			args.push('-deadline', options.deadline);
		}

		// Set pass options
		if (options.pass === 1) {
			pass_args.push('-an');
			pass_args.push('-pass', 1);
		} else if (options.pass === 2) {
			pass_args.push('-pass', 2);
		}

		if (options.qmin) {
			args.push('-qmin', options.qmin);
		}

		if (options.qmax) {
			args.push('-qmax', options.qmax);
		}

		if (options.video_codec) {
			args.push('-codec:v', options.video_codec);
		}

		// Set video bitrate
		if (options.bitrate) {
			args.push('-b:v', options.bitrate);
		}
	}

	if (options.do_audio_copy) {
		args.push('-codec:a', 'copy');

		if (options.audio_bsf) {
			args.push('-bsf:a', options.audio_bsf);
		}
	} else {
		// If it's pass 2, or single pass, allow audio codecs
		if (options.pass !== 1) {
			if (options.audio_codec) {
				pass_args.push('-codec:a', options.audio_codec);
			}
		}
	}

	// Set the container
	if (options.container) {
		args.push('-f', options.container);
	}

	if (options.pass) {
		pass_args.push('-passlogfile', options.pass_prefix);
	}

	args = args.concat(pass_args);

	// Use pipe as output
	args.push('pipe:1');

	return args;
});

/**
 * Stop the conversion
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function stop(err) {

	// Only stop this once
	if (this.stopped) {
		return;
	}

	this.stopped = true;

	if (this.process) {
		this.process.emit('request-kill');
	}

	this.emit('end', err);
});

/**
 * Emit conversion progress
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function report(name, value) {

	if (arguments.length == 1) {
		value = name;
		name = 'conversion';
	}

	this.emit(name, value);
});

/**
 * Get a path with free space
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function getStoragePath(callback) {
	callback(null, '/tmp/');
});

/**
 * Create a directory
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function createDir(path, callback) {
	mkdirp(path, callback);
});

/**
 * Get output codec data
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function getOutputCodecData() {

	var probed = this.probe_result,
	    options = this.encode_options,
	    result = {},
	    key;

	// Video is copied, use probe data
	if (probed && options.do_video_copy && !options.force_video_encode) {
		result.video = {
			codec    : probed.video.codec_name,
			long     : probed.video.codec_long_name,
			profile  : probed.video.profile,
			tag      : probed.video.codec_tag
		};
	} else {
		result.video = {
			codec    : options.video_codec,
			profile  : options.video_profile || 'baseline'
		};
	}

	// Audio is copied, use probe data
	if (probed && options.do_audio_copy && !options.force_audio_encode) {
		result.audio = {
			codec    : probed.audio.codec_name,
			long     : probed.audio.codec_long_name,
			profile  : probed.audio.profile,
			tag      : probed.audio.codec_tag
		};
	} else {

		result.audio = {};

		if (options.audio_codec == 'aac') {
			result.audio.codec = 'aac';
			result.audio.profile = 'lc';
		}
	}

	// Make sure all values are lowercase
	for (key in result.audio) {
		if (result.audio[key]) {
			result.audio[key] = String(result.audio[key]).toLowerCase();
		}
	}

	for (key in result.video) {
		if (result.video[key]) {
			result.video[key] = String(result.video[key]).toLowerCase();
		}
	}

	return result;
});

/**
 * Get the MSE codec type
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function getMseType(callback) {

	var that = this;

	this.after('probed', function probed(did_probe) {

		var options = that.encode_options,
		    probed  = that.probe_result,
		    result  = that.getOutputCodecData(),
		    type;

		// First add the container
		type = 'video/' + options.container + '; codecs="';

		// @todo: also take encoding in consideration

		// Now add the video codec
		switch (result.video.codec) {
			case 'libx264':
			case 'h264':
				type += 'avc1.'

				if (result.video.profile == 'high') {
					// High 3.1
					type += '64001f';
				} else {
					// Baseline 3.0
					type += '42001e';
				}

				console.log('Profile', type, result.video);
				break;

			case 'libvpx':
			case 'webm':
				type += 'vp8';
				break;
		}

		// Now add audio codec
		if (that.audio_enabled && result.audio.codec && (!probed || (probed && probed.audio))) {
			type += ',';

			switch (result.audio.codec) {
				case 'aac':
					if (result.audio.profile == 'lc') {
						// AAC-LC
						type += 'mp4a.40.2';
					} else {
						// HE-AAC
						type += 'mp4a.40.5';
					}
					break;
			}
		}

		type += '"';

		callback(null, type);
	});
});

/**
 * Set the input source
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {String|Stream|Function}   input
 * @param    {String}                   second_input   Needs to be a url
 */
Conversion.setMethod(function setInput(input, second_input) {

	var piece;

	// Set the input
	this.input = input;

	console.log('Setting input', input);

	if (typeof input == 'string') {

		// Get the first 4 characters
		piece = input.slice(0, 4);

		if (piece == 'http' || piece == 'rtsp' || piece == '/dev') {
			this.http_input = true;
		}
	}

	// When make_it_live is true, make sure the stream is flowing,
	// even though ffmpeg hasn't started yet
	if (this.make_it_live) {
		if (input.resume) {
			input.resume();
		}
	} else {
		// Pause it if possible
		if (input.pause) {
			input.pause();
		}
	}

	if (second_input) {
		this.second_input = second_input;
	}
});

/**
 * Get the input stream
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Function}   callback
 */
Conversion.setMethod(function getInputStream(callback) {

	if (!this.input) {
		return callback(new Error('No input has been set'));
	}

	if (this.http_input) {
		console.log('Returning path input');
		return callback(null, this.input);
	}

	if (typeof this.input == 'string') {
		console.log('Returning file input stream');
		return callback(null, fs.createReadStream(this.input));
	}

	if (typeof this.input == 'function') {
		console.log('Returning input function');
		return this.input(callback);
	}

	callback(null, this.input);
});

/**
 * Create encode options after probe
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 * @param    {Object}   probe_result
 *
 * @return   {Object}
 */
Conversion.setMethod(function createEncodeOptions(options, probe_result) {

	if (!probe_result) {
		probe_result = this.probe_result || {};
	}

	if (!options.force_video_encode && probe_result.video) {
		switch (probe_result.video.codec_name) {

			case 'h264':
				if (options.video_codec == 'libx264') {
					options.do_video_copy = true;
				}
				break;

			case 'webm':
				if (options.video_codec == 'libvpx') {
					options.do_video_copy = true;
				}
				break;
		}
	}

	if (!options.force_audio_encode && probe_result.audio) {
		switch (probe_result.audio.codec_name) {
			case 'mp2':
				if (!options.audio_codec) {
					options.do_audio_copy = true;
				}
				break;

			case 'aac':
				if (options.audio_codec == 'aac') {
					options.do_audio_copy = true;
				}
				break;
		}
	}

	this.encode_options = options;

	return options;
});

/**
 * Convert a video using ffmpeg
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Stream}   output
 * @param    {Object}   options
 */
Conversion.setMethod(function start(output, options) {

	var that = this,
	    args,
	    conv,
	    path,
	    input,
	    remuxer,
	    cleanup,
	    informer,
	    passArgs,
	    foundErr,
	    passPrefix;

	options = this.normalizeOptions(options);

	if (options.audio === false) {
		this.enableAudio(false);
	}

	// Emit conversion progress
	that.report(0);

	// Function to cleanup ffmpeg after it ends one way or another
	cleanup = Fn.regulate(function cleanup(err) {

		var total_amount,
		    amount = 100,
		    type;

		console.log('Cleaning up', err, options);

		if (options.pass == 1) {
			type = 'pass_one';
			total_amount = 50;
		} else if (options.pass == 2) {
			type = 'pass_two';
			total_amount = 100;
		}

		// Make sure the input doesn't remain paused
		if (input && input.resume) {
			input.resume();

			if (input.destroy) {
				input.destroy();
			} else if (input.end) {
				input.end();
			}
		}

		if (err) {
			amount = 'failed';
		}

		if (type) {
			that.report(type, amount);
		}

		// If there is an output stream with an `end` method, call it
		if (output && output.end) {
			output.end();
		}

		that.report(total_amount);

		// Nullify the input & outputs
		output = null;
		input = null;

		that.stop(err);
	});

	Fn.series(function gettingPath(next) {
		that.getStoragePath(function gotPath(err, resultPath) {
			if (err) {
				return next(err);
			}

			// Construct the working path
			path = libpath.resolve(resultPath, 'tmp', options.dirid);

			if (typeof output == 'string') {
				if (output[0] != '/') {
					output = libpath.resolve(path, output);
				}
			}

			next();
		});
	}, function creatingOutputStream(next) {

		// If the output isn't a string, it's a stream
		// and we don't need to create a file writestream
		if (typeof output != 'string') {
			that.output = output;
			return next();
		}

		that.createDir(libpath.dirname(output), function createdDir(err) {
			if (err) {
				return next(err);
			}

			output = fs.createWriteStream(output);
			that.output = output;
			next();
		});
	}, function createWebmRemuxer(next) {

		if (!that.webmremux || options.profile != 'webm' || !options.remux) {
			return next();
		}

		// Start the remuxer process
		remuxer = ChildProcess.spawn(that.webmremux, ['-', '-']);

		// Store the remuxer process on the object
		that.remuxer = remuxer;

		// The output of the remuxer should go to the output stream
		remuxer.stdout.pipe(output);

		// Listen for the close event
		remuxer.on('close', function onClose(code) {

			// Ignore close stuff when it has been asked to stop
			if (!that.stopped && code && code != 2) {
				return cleanup(new Error('Remuxer closed with an errorcode: ' + code));
			}

			cleanup(null);
		});

		// Listen for stderr messages
		remuxer.stderr.on('data', function onStdErr(message) {

			if (that.stopped) {
				return;
			}

			message = String(message);

			// Skip unexpected element errors
			if (message.indexOf('Unexpected element') > -1) {
				return;
			}

			console.error('REMUX', message+'');
		});

		// Listen for errors
		remuxer.on('error', function onErr(err) {
			cleanup(err);
		});

		next();

	}, function createInputStream(next) {

		// If it's a http address,
		// set the input option to that too
		if (that.http_input) {
			input = that.input;
			options.input = input;
			return next();
		}

		that.getInputStream(function gotStream(err, stream) {

			if (err) {
				return next(err);
			}

			input = stream;
			next();
		});
	}, function probeStream(next) {

		var probe_stream,
		    multiplier,
		    presult,
		    probe,
		    start;

		presult = that.probe_result;

		// See if this input stream has probe_result set
		if (!presult && typeof input.data == 'function') {
			presult = input.data('probe_result');
		}

		// Don't probe the same source twice
		if (presult) {

			if (!that.probe_result) {
				that.probe_result = presult;
			}

			that.createEncodeOptions(options, presult);
			that.emit('probed', presult);
			return next();
		}

		if (options.probe === false) {
			console.log('Skipping ffprobe');
			that.createEncodeOptions(options, null);
			that.emit('probed', null);
			return next();
		}

		start = Date.now();

		if (!options.force_probe) {
			// Don't probe the stream if no copy is allowed
			if (!options.allow_copy) {
				return next();
			}

			// @todo: what about audio?
			if (options.video_codec == 'copy') {
				options.do_video_copy = true;
				return next();
			}
		}

		if (typeof input == 'string') {
			throw new Error('Can not probe http url or device yet');
		}

		multiplier = new StreamMultiplier(input, 'MediaProbe');

		// Create a new stream for the probe
		probe_stream = multiplier.fork('ProbeStream');

		// Overwrite the input stream with a new fork
		input = multiplier.fork('ConversionStream');

		// When make_it_live is true, don't pause the input stream!
		if (that.make_it_live) {
			input.resume();
		} else {
			// Make sure the input stream remains paused
			input.pause();
		}

		// Create a new probe
		probe = new MediaProbe(that, options);

		// Start probing
		probe.setStream(probe_stream, function gotResult(err, result) {

			console.log('Probed in', Date.now() - start, 'ms');

			// If the probe failed, just continue on
			if (err) {
				return next();
			}

			// Store the info for later
			that.probe_result = result;

			// Also store in the multiplier
			probe_stream.data('probe_result', result);

			that.createEncodeOptions(options, result);

			that.emit('probed', result);

			next();
		});

	}, function creatingArgs(next) {

		// Create the arguments
		args = that.createArgs(options);

		// And create the working directory
		that.createDir(path, next);
	}, function checkPassOne(next) {

		// Only check if this is indeed the first pass we want
		if (options.pass !== 1 || options.forcePassOne) {
			return next();
		}

		fs.exists(libpath.resolve(path, passPrefix + '-0.log'), function checkExists(exists) {

			// If the pass-1 logfile exists we can exit
			if (exists) {
				return cleanup(null);
			}

			next();
		});
	}, function encoding(err) {

		var seenError = false,
		    last_error = '';

		if (err) {
			console.log(err);
			return cleanup(err);
		}

		console.log('FFMPEG args:', args, options, args.join(' '));

		// Spawn the process
		conv = ChildProcess.spawn(options.ffmpeg_path || '/usr/bin/ffmpeg', args, {cwd: path});

		// Store the process on the object
		that.process = conv;

		// Set the niceness to 10 by default
		that.renice();

		// Emit the start event
		that.emit('start');

		// The ffmpeg output needs to go into the remuxer if it's enabled
		if (remuxer) {
			conv.stdout.pipe(remuxer.stdin);
		} else {

			if (output) {
				conv.stdout.pipe(output);
			} else {
				that.emit('output', conv.stdout);
			}
		}

		// If the input is really a stream...
		if (input && input.pipe) {
			// Pipe the input stream into ffmpeg's stdin
			// Warning: only use pipe, using 'data' event will cause memory leaks
			// (even though we close the input stream later... It still leaks)
			input.pipe(conv.stdin);
		}

		// Listen to the end, but don't callback yet
		conv.stdout.on('end', function onEnd() {
			// Transcoding has ended, first before conv exit event
			cleanup();
		});

		conv.on('exit', function onExit(code) {
			// FFMPEG has exited, need to wait on remuxer
			that.process = null;

			if (code) {
				console.log('FFMPEG exited with code', code);
				console.log('FFMPEG last error:\n' + last_error);
			}

			if (seenError) {
				return cleanup(seenError);
			}

			cleanup();
		});

		// The stdin of the process closes before
		// sending the correct close events,
		// so just ignore errors
		conv.stdin.on('error', function onStdinError(err) {
			// Ignore!
		});

		// Listen for errors
		conv.on('error', function onErr(err) {
			cleanup(err);
		});

		// Listen for stderr messages
		conv.stderr.on('data', function onStdErr(message) {

			var extract,
			    temp,
			    info;

			if (that.stopped) {
				return;
			}

			// Debug code
			// if (!that.http_input) {
			// 	console.log('' + message);
			// 	//fs.appendFile('/media/bridge/mc.log', '' + message);
			// }

			message = ''+message;

			// Store this as the last error
			last_error = message;

			if (message.indexOf('onversion failed') > -1) {
				return cleanup(new Error('Conversion failed'));
			}

			// "frame= 131 fps= 18 q=0.0 size=    0kb time=00:00:00 bitrate=N/A   \r"
			// ==> ["frame= 131 fps= 18 q=0.0 size=    0kb", "131", "18", "0.0", "0"]
			temp = /frame\=\W*(\d+) fps\=\W*(\d*\.?\d*) q=\W*(\d*\.?\d*) size=\W+(\d*\.?\d*)kb/i.exec(message);

			if (!temp) {

				if (message.indexOf('Metadata') > -1) {

					if (that.video_info == null) {
						// @todo: much improvements
						extract = /Stream #.* Video: (.+?) /.exec(message);

						if (extract && extract[0]) {
							that.video_info = extract[0];
							that.emit('input_codec', that.video_info);
						}
					}

					return console.log('FFMPEG:', message);
				}

				if (message.indexOf('[lib') > -1) {
					return;
				}

				if (message.indexOf('Copyright') > -1) {
					return;
				}

				if (message.indexOf('Failed to initialize encoder') > -1) {
					console.log('FFMPEG Failure:', message);
					return cleanup(new Error('Failed to initialize encoder'));
				}

				if (message.indexOf('Error reading log file') > -1) {
					seenError = message;
				}

				that.report('conversion_error', message);

				return;
			}

			info = {
				frame: Number(temp[1]),
				fps: Number(temp[2]),
				q: Number(temp[3]),
				size: Number(temp[4]) * 1024
			};

			that.emit('progress', info);
		});

		// Listen to the kill request
		conv.on('request-kill', function onRequestKill() {

			if (remuxer) {
				remuxer.stdout.unpipe(output);
				conv.stdout.unpipe(remuxer.stdin);
				remuxer.kill();
			}

			if (input && input.unpipe) {
				input.unpipe(conv.stdin);
			}

			conv.kill();
		});

		// Make sure the input starts streaming
		if (input && input.resume) {
			input.resume();
		}

		// Also cleanup when the output ends
		if (output && typeof output.on == 'function') {
			output.on('finish', cleanup);
			output.on('end', cleanup);
			output.on('close', cleanup);
			output.on('error', cleanup)
		}
	});

	return this;
});

/**
 * Register the webm profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 *
 * @return   {Object}
 */
Conversion.registerProfile(function webm(options) {

	var result,
	    def;

	def = {
		audio_codec : 'libvorbis', // Vorbis audio
		video_codec : 'libvpx',    // vp8 video
		container   : 'webm',      // webm container
		remux       : true,        // remux webm for MSE if available
		qmin        : 10,
		qmax        : 40,
	};

	result = Obj.merge({}, def, options);

	// Set cpu_used,
	// which is a webm only thing.
	// The higher the value, the more cpu used,
	// but the worse the quality
	if (result.cpu_used == null) {
		if (result.realtime) {
			result.cpu_used = 2;
		} else {
			result.cpu_used = 0;
		}
	}

	return result;
});

/**
 * Register the mp3 profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 *
 * @return   {Object}
 */
Conversion.registerProfile(function mp3(options) {

	var result,
	    def;

	def = {
		audio_codec : 'libmp3lame', // Vorbis audio
		container   : 'mp3',      // webm container
	};

	result = Obj.merge({}, def, options);

	return result;
});

/**
 * Register the mp4 profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 *
 * @return   {Object}
 */
Conversion.registerProfile(function mp4(options) {

	var result,
	    def;

	def = {
		video_profile      : 'baseline',
		video_level        : 13,
		audio_codec        : 'aac',
		video_codec        : 'libx264',
		container          : 'mp4',
		extra_args         : [
			'-movflags', 'isml+empty_moov+default_base_moof+frag_keyframe'
		],
		audio_bsf          : 'aac_adtstoasc'
	};

	if (options.realtime) {
		// A single fragment should not last longer than 5 frames
		def.extra_args.push('-x264opts', 'keyint=5:min-keyint=5:scenecut=-1');
	}

	result = Obj.merge({}, def, options);

	return result;
});

/**
 * Register the jsmpeg profile
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.1
 * @version  0.1.1
 *
 * @param    {Object}   options
 *
 * @return   {Object}
 */
Conversion.registerProfile(function jsmpeg(options) {

	var result,
	    def;

	def = {
		audio              : false,
		bufsize            : null,
		video_codec        : 'mpeg1video',
		//container          : 'mpeg1video',
		container          : 'mpeg',
		extra_args         : [
			'-vf', 'crop=iw-mod(iw\\,2):ih-mod(ih\\,2)', '-b', '0'
		]
	};

	result = Obj.merge({}, def, options);

	return result;
});

/**
 * Register the copy profile:
 * copy the video & audio streams,
 * mux them into a mpegts container by default
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Object}   options
 *
 * @return   {Object}
 */
Conversion.registerProfile(function copy(options) {

	var result,
	    def;

	def = {
		audio_codec        : 'copy',
		video_codec        : 'copy',
		container          : 'mpegts',
	};

	// Matroska can handle variable framerates just fine,
	// avi and such don't
	if (options.variable_framerate) {
		def.container = 'matroska';
		def.copyts = false;
		def.extra_args = [
			'-vsync', '2'
		];
	}

	result = Obj.merge({}, def, options);

	return result;
});

module.exports = Conversion;