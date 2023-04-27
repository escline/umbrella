import type { IDeref } from "@thi.ng/api";
import type { ILogger } from "@thi.ng/logger";
import type { Quantity } from "@thi.ng/units";
import type { ReadonlyVec } from "@thi.ng/vectors";

/** Start command sequence (configurable via {@link AxiDrawOpts}) */
export type StartCommand = ["start"];

/** Stop command sequence (configurable via {@link AxiDrawOpts}) */
export type StopCommand = ["stop"];

/** Return plotter to initial XY position */
export type HomeCommand = ["home"];

/** Reset curr position as home (0,0) */
export type ResetCommand = ["reset"];

/** Turn XY motors on/off */
export type MotorCommand = ["on" | "off"];

/** Pen config, min/down position, max/up position (in %) */
export type PenConfigCommand = ["pen", number?, number?];

/**
 * Pen up/down, optional delay (in ms), optional custom level/position. If
 * omitted, default values used from {@link AxiDrawOpts}. Using -1 as delay also
 * uses default.
 */
export type PenUpDownCommand = ["u" | "d", number?, number?];

/**
 * Move to abs pos (in worldspace coords, default mm), optional speed factor
 * (default: 1)
 */
export type MoveXYCommand = ["M", ReadonlyVec, number?];

/**
 * Move to **relative** pos (based on curr plotter position, im worldspace
 * units, default mm), optional speed factor (default: 1)
 */
export type MoveRelCommand = ["m", ReadonlyVec, number?];

/** Explicit delay (in ms) */
export type WaitCommand = ["w", number];

/** Ignored, but will be logged (if logging enabled) */
export type CommentCommand = ["comment", string];

/**
 * Stores current pen configuration on stack.
 */
export type SaveCommand = ["save"];

/**
 * Restores current pen configuration from stack.
 */
export type RestoreCommand = ["restore"];

export type DrawCommand =
	| CommentCommand
	| HomeCommand
	| MotorCommand
	| MoveRelCommand
	| MoveXYCommand
	| PenConfigCommand
	| PenUpDownCommand
	| ResetCommand
	| RestoreCommand
	| SaveCommand
	| StartCommand
	| StopCommand
	| WaitCommand;

/**
 * Global plotter drawing configuration. Also see {@link DEFAULT_OPTS}.
 */
export interface AxiDrawOpts {
	/**
	 * Serial connection to use (only used for testing/dev purposes, otherwise
	 * leave default).
	 *
	 * @defaultValue {@link SERIAL_PORT}
	 */
	serial: SerialConnection;
	/**
	 * Logger instance for outputting draw commands, state info and metrics.
	 */
	logger: ILogger;
	/**
	 * Optional implementation to pause, resume or cancel the processing of
	 * drawing commands (see {@link AxiDrawControl} for default impl).
	 *
	 * @remarks
	 * If a control is provided, it will be checked prior to processing each
	 * individual command. Drawing will be paused if the control state is in
	 * {@link AxiDrawState.PAUSE} state and the control will be rechecked every
	 * {@link AxiDrawOpts.refresh} milliseconds for updates. In paused state,
	 * the pen will be automatically lifted (if it wasn't already) and when
	 * resuming it will be sent down again (if it was originally down).
	 *
	 * Draw commands are only sent to the machine if no control is provided at
	 * all or if the control is in the {@link AxiDrawState.CONTINUE} state.
	 */
	control?: IDeref<AxiDrawState>;
	/**
	 * All XY coords will be clamped to given bounding rect, either defined by
	 * `[[minX,minY], [maxX,maxY]]` (in worldspace units) or as paper size
	 * defined as a
	 * [`quantity`](https://docs.thi.ng/umbrella/units/functions/quantity-1.html).
	 * The default value is DIN A3 landscape.
	 *
	 * @remarks
	 * Set to `undefined` to disable bounds/clipping. If given a paper size (via
	 * thi.ng/units `quantity()`), the units used to define these dimensions are
	 * irrelevant (and independent of {@link AxiDrawOpts.unitsPerInch}!) and
	 * will be automatically converted. Also, the resulting bounds will always
	 * be based on [0, 0].
	 *
	 * List of paper sizes/presets:
	 * https://github.com/thi-ng/umbrella/blob/develop/packages/units/README.md#constants
	 *
	 * Also see {@link AxiDrawOpts.unitsPerInch}
	 *
	 * @defaultValue `DIN_A3_LANDSCAPE`
	 */
	bounds?: [ReadonlyVec, ReadonlyVec] | Quantity<number[]>;
	/**
	 * Conversion factor from geometry worldspace units to inches.
	 * Default units are millimeters.
	 *
	 * @defaultValue 25.4
	 */
	unitsPerInch: number;
	/**
	 * Hardware resolution (steps / inch)
	 *
	 * @defaultValue 2032
	 */
	stepsPerInch: number;
	/**
	 * Steps per second for XY movements whilst pen down
	 *
	 * @defaultValue 4000
	 */
	speedDown: number;
	/**
	 * Steps per second for XY movements whilst pen up
	 *
	 * @defaultValue 4000
	 */
	speedUp: number;
	/**
	 * Up position (%)
	 *
	 * @defaultValue 60
	 */
	up: number;
	/**
	 * Down position (%)
	 *
	 * @defaultValue 30
	 */
	down: number;
	/**
	 * Rate of raising pen (1-100) (%)
	 *
	 * @defaultValue 75
	 */
	upRate: number;
	/**
	 * Rate of lowering pen (1-100) (%)
	 *
	 * @defaultValue 50
	 */
	downRate: number;
	/**
	 * Delay after pen up
	 *
	 * @defaultValue 0
	 */
	delayUp: number;
	/**
	 * Delay after pen down
	 *
	 * @defaultValue 0
	 */
	delayDown: number;
	/**
	 * Time in ms to subtract from actual delay time until next command
	 *
	 * @defaultValue 30
	 */
	preDelay: number;
	/**
	 * Sequence for `start` {@link DrawCommand}
	 *
	 * @defaultValue `[ON, PEN, UP]`
	 */
	start: DrawCommand[];
	/**
	 * Sequence for `end` {@link DrawCommand}
	 *
	 * @defaultValue `[UP, HOME, OFF]`
	 */
	stop: DrawCommand[];
	/**
	 * Position (in world space units) which is considered the origin and which
	 * will be added to all coordinates as offset (e.g. for plotting with a
	 * physically offset easel).
	 *
	 * @remarks
	 * Note: The configured {@link AxiDrawOpts.bounds} are independent from this
	 * setting and are intended to enforce the plotter's physical movement
	 * limits. E.g. shifting the home/offset position by +100mm along X (and
	 * assuming only positive coordinates will be used for the drawing), simply
	 * means the available horizontal drawing space will be reduced by the same
	 * amount...
	 *
	 * @defaultValue [0, 0]
	 */
	home: ReadonlyVec;
	/**
	 * Refresh interval for checking the control FSM in paused state.
	 *
	 * @defaultValue 1000
	 */
	refresh: number;
	/**
	 * If true (default), installs SIGINT handler to lift pen when the Node.js
	 * process is terminated.
	 */
	sigint: boolean;
	/**
	 * Select the hardware configuration for the AxiDraw's pen-lift servo
	 * mechanism. Unless changed, this option leaves your AxiDraw configured
	 * to use its factory-standard pen-lift servo.
	 * 
	 * A value of 3 configures the servo output to instead (A) be directed to
	 * output pin "B2", the third set up on the AxiDraw's EBB control board
	 * (two positions higher than normal) and (B) produce a control signal
	 * appropriate for a narrow-band brushless pen-lift servo motor.
	 * 
	 * @defaultValue 1
	 */
	penlift: number;
	/**
	 * EBB I/O pin number (port B) to control the pen-lift servo motor
	 * Standard servo: (pin RB1)
	 * 
	 * @defaultValue 1
	 */
	servo_pin: number;
	/**
	 * Servo motion limits, in units of (1/12 MHz), about 83.3 ns:
	 * Up at "100%" position. Default: 27831 83.3 ns units, or 2.32 ms.
	 * 
	 * @defaultValue 27831
	 */
	servo_max: number
	/**
	 * Servo motion limits, in units of (1/12 MHz), about 83.3 ns:
	 * Down at "0%" position. Default: 9855 83.3 ns units,  or 0.82 ms.
	 * 
	 * @defaultValue 9855
	 */
	servo_min: number
	/**
	 * Time for servo control signal to sweep over full 0-100% range, at 100%
	 * pen lift/lower rates. Duration, ms, to sweep control signal over 100%
	 * range.
	 * 
	 * @defaultValue 200
	 */
	servo_sweep_time: number;
	/**
	 * Time (for pen lift servo to physically move) = slope * distance + min,
	 * with a full speed sweep. Minimum time, ms, for pen lift/lower of
	 * non-zero distance.
	 * 
	 * @defaultValue 45
	 */
	servo_move_min: number;
	/**
	 * Additional time, ms, per % of vertical travel.
	 * 
	 * @defaultValue 2.69
	 */
	servo_move_slope: number;
	/**
	 * EBB I/O pin number (port B) to control the pen-lift servo motor
	 * Narrow-band servo: (pin RB2, two positions above the standard servo
	 * output pins)
	 * 
	 * @defaultValue 2
	 */
	nb_servo_pin: number;
		/**
	 * Servo motion limits, in units of (1/12 MHz), about 83.3 ns:
	 * Up at "100%" position. Default: 12600 83.3 ns units, or 1.05 ms.
	 * 
	 * @defaultValue 12600
	 */
	nb_servo_max: number
	/**
	 * Servo motion limits, in units of (1/12 MHz), about 83.3 ns:
	 * Down at "0%" position. Default: 5400 83.3 ns units,  or 0.45 ms.
	 * 
	 * @defaultValue 5400
	 */
	nb_servo_min: number
	/**
	 * Time for servo control signal to sweep over full 0-100% range, at 100%
	 * pen lift/lower rates. Duration, ms, to sweep control signal over 100%
	 * range.
	 * 
	 * @defaultValue 70
	 */
	nb_servo_sweep_time: number;
	/**
	 * Time (for pen lift servo to physically move) = slope * distance + min,
	 * with a full speed sweep. Minimum time, ms, for pen lift/lower of
	 * non-zero distance.
	 * 
	 * @defaultValue 20
	 */
	nb_servo_move_min: number;
	/**
	 * Additional time, ms, per % of vertical travel.
	 * 
	 * @defaultValue 1.28
	 */
	nb_servo_move_slope: number;
	/**
	 * Time, ms, for servo motor to power down after last movement command
	 * 
	 * This feature requires EBB v 2.5 hardware (with USB micro not USB mini
	 * connector), firmware version 2.6.0, and servo_pin set to 1 (only).
	 * 
	 * @defaultValue 60000
	 */
	servo_timeout: number;
}

/**
 * FSM state enum for (interactive) control for processing of drawing commands.
 * See {@link AxiDraw.draw} and {@link AxiDrawControl} for details.
 */
export enum AxiDrawState {
	/**
	 * Draw command processing can continue as normal.
	 */
	CONTINUE,
	/**
	 * Draw command processing is suspended indefinitely.
	 */
	PAUSE,
	/**
	 * Draw command processing is cancelled.
	 */
	CANCEL,
}

/**
 * Drawing behavior options for a single polyline.
 */
export interface PolylineOpts {
	/**
	 * Speed factor (multiple of globally configured draw speed). Depending on
	 * pen used, slower speeds might result in thicker strokes.
	 *
	 * @defaultValue 1
	 */
	speed: number;
	/**
	 * Pen down (Z) position (%) for this particular shape/polyline. Will be
	 * reset to globally configured default at the end of the shape.
	 */
	down: number;
	/**
	 * Delay for pen down command at the start of this particular
	 * shape/polyline.
	 */
	delayDown: number;
	/**
	 * Delay for pen up command at the end this particular shape/polyline.
	 */
	delayUp: number;
	/**
	 * If enabled, no pen up/down commands will be included.
	 * {@link PolylineOpts.speed} is the only other option considered then.
	 *
	 * @defaultValue false
	 */
	onlyGeo: boolean;
}

/**
 * Metrics returned by {@link AxiDraw.draw}.
 */
export interface Metrics {
	/**
	 * Total number of milliseconds taken for drawing all given commands (incl.
	 * any pauses caused by the control)
	 */
	duration: number;
	/**
	 * Total draw distance, i.e. distance traveled whilst pen down (in original
	 * user units, see {@link AxiDrawOpts.unitsPerInch}).
	 */
	drawDist: number;
	/**
	 * Total traveled, incl. any movements without drawing (in original user
	 * units, see {@link AxiDrawOpts.unitsPerInch}).
	 */
	totalDist: number;
	/**
	 * Number of pen up/down commands (useful for measuring servo lifespan).
	 */
	penCommands: number;
	/**
	 * Total number of {@link DrawCommand}s processed.
	 */
	commands: number;
}

export interface SerialConnection {
	/**
	 * Async function. Returns a list of available serial ports. The arg given
	 * is the path requested by the user when calling {@link AxiDraw.connect}.
	 *
	 * @param path
	 */
	list(path: string): Promise<{ path: string }[]>;
	/**
	 * Returns an actual serial port (or mock) instance, is given the first
	 * matching path in array returned by {@link SerialConnection.list}.
	 *
	 * @param path
	 * @param baudRate
	 */
	ctor(path: string, baudRate: number): ISerial;
}

export interface ISerial {
	close(): void;
	/**
	 * Writes given string to the port.
	 *
	 * @param msg
	 */
	write(msg: string): void;
}
