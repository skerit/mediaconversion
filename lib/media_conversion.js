var ChildProcess       = require('child_process'),
    libpath            = require('path'),
    mkdirp             = require('mkdirp'),
    MediaProbe         = require('./media_probe'),
    StreamMultiplier   = require('./stream_multiplier'),
    Blast,
    Obj,
    Fn,
    fs           = require('fs');

if (typeof __Protoblast) {
	Blast = __Protoblast;
} else {
	Blast = require('protoblast')(false);
}

Obj = Blast.Bound.Object;
Fn = Blast.Bound.Function;

/**
 * The MediaConversion Class
 *
 * @constructor
 *
 * @author   Jelle De Loecker   <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
var Conversion = Fn.inherits('Informer', 'Develry', function MediaConversion() {

	// The input stream
	this.input = null;

	// The output stream
	this.output = null;

	// The ffmpeg process
	this.process = null;

	// The remuxer process
	this.remuxer = null;

	// Has this media conversion been stopped deliberately?
	this.stopped = null;

	// The niceness level
	this.niceness = 19;

	// Path to webmremux binary
	this.webmremux = null;

	// Info on the input stream
	this.probe_result = null;

	// The input video type
	this.video_info = null;
});

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
	allow_copy : true,

	// Copy the timestamp
	copyts     : true,

	// Default working directory id
	dirid      : 'def',

	// Don't specify a duration
	duration   : null,

	// Don't force encoding by default
	force_video_encode: false,
	force_audio_encode: false,

	// Do a single pass by default (other values are 1 or 2)
	pass       : null,

	// Don't use a start time
	start      : null,

	// Don't be too strict, don't quit on experimental arguments
	strict     : -2,

	// Use up to 6 threads
	threads    : 6
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
 * Create an argument array
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 */
Conversion.setMethod(function createArgs(options) {

	var pass_args = [],
	    args = [];

	// Start with the pipe input
	args.push('-i', 'pipe:0');

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

	this.after('probed', function probed() {

		var options = that.encode_options,
		    probed  = that.probe_result,
		    result  = that.getOutputCodecData(),
		    type;

		// First add the container
		type = 'video/' + options.container + '; codecs="';

		// @todo: also take encoding in consideration

		// Now add the video codec
		switch (result.video.codec) {
			case 'h264':
				type += 'avc1.'

				if (result.video.profile == 'high') {
					// High 3.1
					type += '64001f';
				} else {
					// Baseline 3.0
					type += '42001e';
				}
				break;

			case 'webm':
				type += 'vp8';
				break;
		}

		// Now add audio codec
		if (result.audio.codec) {
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
 * Convert a video using ffmpeg
 *
 * @author   Jelle De Loecker <jelle@develry.be>
 * @since    0.1.0
 * @version  0.1.0
 *
 * @param    {Stream}   input
 * @param    {Stream}   output
 * @param    {Object}   options
 */
Conversion.setMethod(function start(input, output, options) {

	var that = this,
	    args,
	    conv,
	    path,
	    remuxer,
	    cleanup,
	    informer,
	    passArgs,
	    foundErr,
	    passPrefix;

	if (!input) {
		return that.emit('error', new Error('No input given'));
	}

	options = this.normalizeOptions(options);

	// Make sure the stream input is paused
	if (input.pause) {
		input.pause();
	}

	// Emit conversion progress
	that.report(0);

	// Function to cleanup ffmpeg after it ends one way or another
	cleanup = Fn.regulate(function cleanup(err) {

		var total_amount,
		    amount = 100,
		    type;

		if (options.pass == 1) {
			type = 'pass_one';
			total_amount = 50;
		} else if (options.pass == 2) {
			type = 'pass_two';
			total_amount = 100;
		}

		// Make sure the input doesn't remain paused
		if (input) {
			input.resume();
			input = null;
		}

		if (err) {
			amount = 'failed';
		}

		if (type) {
			that.report(type, amount);
		}

		that.report(total_amount);

		output = null;
		that.stop(err);
	});

	Fn.series(function gettingPath(next) {
		that.getStoragePath(function gotPath(err, resultPath) {
			if (err) {
				return next(err);
			}

			// Construct the working path
			path = libpath.resolve(resultPath, 'tmp', options.dirid);

			if (typeof input == 'string') {
				input = fs.createReadStream(input);
				input.pause();
			}

			// Set the input on the object
			that.input = input;

			if (typeof output == 'string') {

				if (output[0] != '/') {
					output = libpath.resolve(path, output);
				}
			}

			next();
		});
	}, function creatingOutputStream(next) {

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

	}, function probeStream(next) {

		var probe_stream,
		    multiplier,
		    probe;

		// Don't probe the stream if no copy is allowed
		if (!options.allow_copy) {
			return next();
		}

		// @todo: what about audio?
		if (options.video_codec == 'copy') {
			options.do_video_copy = true;
			return next();
		}

		console.log('Creating probe')

		multiplier = new StreamMultiplier(input);

		// Create a new stream for the probe
		probe_stream = multiplier.fork();

		// Overwrite the input stream with a new fork
		input = multiplier.fork();

		// Make sure the input stream remains paused
		input.pause();

		// Create a new probe
		probe = new MediaProbe();

		// Start probing
		probe.setStream(probe_stream, function gotResult(err, result) {

			console.log('Got probe result:', err, result);

			// If the probe failed, just continue on
			if (err) {
				return next();
			}

			// Store the info for later
			that.probe_result = result;

			if (!options.force_video_encode && result.video) {
				switch (result.video.codec_name) {

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

			if (!options.force_audio_encode && result.audio) {
				switch (result.audio.codec_name) {
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

			that.encode_options = options;

			that.emit('probed');

			next();
		});

	}, function creatingArgs(next) {

		args = that.createArgs(options);

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

		var seenError = false;

		if (err) {
			console.log(err);
			return cleanup(err);
		}

		console.log('FFMPEG args:', args, args.join(' '));

		// Spawn the process
		conv = ChildProcess.spawn('/usr/bin/ffmpeg', args, {cwd: path});

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
			conv.stdout.pipe(output);
		}

		// Pipe the input stream into ffmpeg's stdin
		input.pipe(conv.stdin);

		input.on('end', function() {
			console.log('Input has ended, setting to null');
			input = null;
		});

		// Listen to the end, but don't callback yet
		conv.stdout.on('end', function onEnd() {
			// Transcoding has ended, first before conv exit event
			cleanup();
		});

		conv.on('exit', function onExit(code) {
			// FFMPEG has exited, need to wait on remuxer
			that.process = null;
			console.log('Ffmpeg exited with code', code);

			if (seenError) {
				return cleanup(seenError);
			}

			cleanup();
		});

		// Listen for errors
		conv.on('error', function onErr(err) {
			console.error('FFMPEG PROCESS ERROR', err+'');
			cleanup(err);
		})

		// Listen for stderr messages
		conv.stderr.on('data', function onStdErr(message) {

			var extract,
			    temp,
			    info;

			if (that.stopped) {
				return;
			}

			message = ''+message;

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

			if (input) {
				input.unpipe(conv.stdin);
			}

			conv.kill();
		});

		console.log('Starting FFMPEG, resuming input');

		// Make sure the input starts streaming
		input.resume();

		console.log('Resumed stream', input, input.p_id);

		console.log(args.join(' '));
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
		video_profile : 'baseline',
		video_level   : 13,
		audio_codec   : 'aac',
		video_codec   : 'libx264',
		container     : 'mp4',
		extra_args    : ['-movflags', 'empty_moov+default_base_moof+frag_keyframe']
	};

	result = Obj.merge({}, def, options);

	return result;
});

module.exports = Conversion;