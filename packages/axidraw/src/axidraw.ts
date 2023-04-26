import type { IReset } from "@thi.ng/api";
import { isString } from "@thi.ng/checks/is-string";
import { delayed } from "@thi.ng/compose/delayed";
import { formatDuration } from "@thi.ng/date/format";
import { assert } from "@thi.ng/errors/assert";
import { ioerror } from "@thi.ng/errors/io";
import { unsupported } from "@thi.ng/errors/unsupported";
import { ConsoleLogger } from "@thi.ng/logger/console";
import { DIN_A3_LANDSCAPE } from "@thi.ng/units/constants/paper-sizes";
import { convert, div, Quantity } from "@thi.ng/units/unit";
import { inch } from "@thi.ng/units/units/length";
import { abs2 } from "@thi.ng/vectors/abs";
import {
	ZERO2,
	type ReadonlyVec,
	type Vec,
	type VecPair,
} from "@thi.ng/vectors/api";
import { clamp2 } from "@thi.ng/vectors/clamp";
import { maddN2 } from "@thi.ng/vectors/maddn";
import { mag } from "@thi.ng/vectors/mag";
import { mulN2 } from "@thi.ng/vectors/muln";
import { set2 } from "@thi.ng/vectors/set";
import { zero } from "@thi.ng/vectors/setn";
import { sub2 } from "@thi.ng/vectors/sub";
import {
	AxiDrawState,
	type AxiDrawOpts,
	type DrawCommand,
	type ISerial,
	type Metrics,
} from "./api.js";
import { complete, HOME, OFF, ON, PEN, UP } from "./commands.js";
import { AxiDrawControl } from "./control.js";
import { SERIAL_PORT } from "./serial.js";

export const DEFAULT_OPTS: AxiDrawOpts = {
	serial: SERIAL_PORT,
	logger: new ConsoleLogger("axidraw"),
	control: new AxiDrawControl(),
	refresh: 1000,
	bounds: DIN_A3_LANDSCAPE,
	home: [0, 0],
	unitsPerInch: 25.4,
	stepsPerInch: 2032,
	speedDown: 4000,
	speedUp: 4000,
	up: 60,
	down: 30,
	upRate: 75,
	downRate: 50,
	delayUp: 0,
	delayDown: 0,
	preDelay: 0,
	start: [ON, PEN(), UP()],
	stop: [UP(), HOME, OFF],
	sigint: true,
	penlift: 1,
	servo_pin: 1,
	servo_max: 27831,
	servo_min: 9855,
	servo_sweep_time: 200,
	servo_move_min: 45,
	servo_move_slope: 2.69,
	nb_servo_pin: 2,
	nb_servo_max: 12600,
	nb_servo_min: 5400,
	nb_servo_sweep_time: 70,
	nb_servo_move_min: 20,
	nb_servo_move_slope: 1.28,
};

export class AxiDraw implements IReset {
	serial!: ISerial;
	opts: AxiDrawOpts;
	isConnected = false;
	isPenDown = false;
	penLimits: [number, number];
	penState: [number, number][] = [];
	pos: Vec = [0, 0];
	targetPos: Vec = [0, 0];
	homePos!: ReadonlyVec;
	scale: number;
	bounds?: VecPair;


	constructor(opts: Partial<AxiDrawOpts> = {}) {
		this.opts = { ...DEFAULT_OPTS, ...opts };
		this.penLimits = [this.opts.down, this.opts.up];
		this.scale = this.opts.stepsPerInch / this.opts.unitsPerInch;
		this.setHome(this.opts.home);
		if (this.opts.bounds) {
			this.bounds =
				this.opts.bounds instanceof Quantity
					? [
							[0, 0],
							convert(
								this.opts.bounds,
								div(inch, this.opts.stepsPerInch)
							),
					  ]
					: [
							mulN2([], this.opts.bounds[0], this.scale),
							mulN2([], this.opts.bounds[1], this.scale),
					  ];
		}
		this.save();
	}

	reset() {
		zero(this.pos);
		zero(this.targetPos);
		this.send("R\r");
		return this;
	}

	/**
	 * Async function. Attempts to connect to the drawing machine via given
	 * (partial) serial port path/name, returns true if successful.
	 *
	 * @remarks
	 * First matching port will be used. If `path` is a sting, a port name must
	 * only start with it in order to be considered a match.
	 *
	 * An error is thrown if no matching port could be found.
	 *
	 * @param path
	 */
	async connect(path: string | RegExp = "/dev/tty.usbmodem") {
		const isStr = isString(path);
		for (let port of await this.opts.serial.list(path.toString())) {
			if (
				(isStr && port.path.startsWith(path)) ||
				(!isStr && path.test(port.path))
			) {
				this.opts.logger.info(`using device: ${port.path}...`);
				this.serial = this.opts.serial.ctor(port.path, 38400);
				this.isConnected = true;
				if (this.opts.sigint) {
					this.opts.logger.debug("installing signal handler...");
					process.on("SIGINT", this.onSignal.bind(this));
				}
				return;
			}
		}
		ioerror(`no matching device for ${path}`);
	}

	disconnect() {
		this.serial.close();
	}

	/**
	 * Async function. Converts sequence of {@link DrawCommand}s into actual EBB
	 * commands and sends them via configured serial port to the AxiDraw. If
	 * `wrap` is enabled (default), the given commands will be automatically
	 * wrapped with start/stop commands via {@link complete}. Returns object of
	 * collected {@link Metrics}. If `showMetrics` is enabled (default), the
	 * metrics will also be written to the configured logger.
	 *
	 * @remarks
	 * This function is async and if using `await` will only return once all
	 * commands have been processed or cancelled.
	 *
	 * The `control` implementation/ provided as part of {@link AxiDrawOpts} can
	 * be used to pause, resume or cancel the drawing (see
	 * {@link AxiDrawOpts.control} for details).
	 *
	 * Reference:
	 * - http://evil-mad.github.io/EggBot/ebb.html
	 *
	 * @example
	 * ```ts
	 * // execute start sequence, draw a triangle, then exec stop sequence
	 * axi.draw([
	 *   ["start"],
	 *   ...axi.polyline([[50,50], [100,50], [75, 100], [50,50]]),
	 *   ["stop"]
	 * ]);
	 * ```
	 *
	 * @param commands
	 * @param wrap
	 * @param showMetrics
	 */
	async draw(
		commands: Iterable<DrawCommand>,
		wrap = true,
		showMetrics = true
	) {
		assert(
			this.isConnected,
			"AxiDraw not yet connected, need to call .connect() first"
		);
		let t0 = Date.now();
		let numCommands = 0;
		let penCommands = 0;
		let totalDist = 0;
		let drawDist = 0;
		const $recordDist = (dist: number) => {
			totalDist += dist;
			if (this.isPenDown) drawDist += dist;
		};
		const { control, logger, preDelay, refresh } = this.opts;
		for (let $cmd of wrap ? complete(commands) : commands) {
			numCommands++;
			if (control) {
				let state = control.deref();
				if (state === AxiDrawState.PAUSE) {
					const penDown = this.isPenDown;
					if (penDown) this.penUp();
					do {
						await delayed(0, refresh);
					} while ((state = control.deref()) === AxiDrawState.PAUSE);
					if (state === AxiDrawState.CONTINUE && penDown) {
						this.penDown();
					}
				}
				if (state === AxiDrawState.CANCEL) {
					this.penUp();
					break;
				}
			}
			const [cmd, a, b] = $cmd;
			let wait: number = -1;
			let dist: number;
			switch (cmd) {
				case "start":
				case "stop": {
					const metrics = await this.draw(
						this.opts[cmd],
						false,
						false
					);
					numCommands += metrics.commands;
					penCommands += metrics.penCommands;
					totalDist += metrics.totalDist;
					drawDist += metrics.drawDist;
					break;
				}
				case "home":
					[wait, dist] = this.home();
					$recordDist(dist);
					break;
				case "reset":
					this.reset();
					break;
				case "on":
					this.motorsOn();
					break;
				case "off":
					this.motorsOff();
					break;
				case "pen":
					this.penConfig(a, b);
					break;
				case "u":
					wait = this.penUp(a, b);
					penCommands++;
					break;
				case "d":
					wait = this.penDown(a, b);
					penCommands++;
					break;
				case "save":
					this.save();
					break;
				case "restore":
					this.restore();
					break;
				case "w":
					wait = <number>a;
					break;
				case "M":
					[wait, dist] = this.moveTo(a, b);
					$recordDist(dist);
					break;
				case "m":
					[wait, dist] = this.moveRelative(a, b);
					$recordDist(dist);
					break;
				case "comment":
					logger.info(`comment: ${a}`);
					break;
				default:
					unsupported(`unknown command: ${$cmd}`);
			}
			if (wait > 0) {
				wait = Math.max(0, wait - preDelay);
				logger.debug(`waiting ${wait}ms...`);
				await delayed(0, wait);
			}
			// restore one-off pen config to current state
			if (cmd === "d" && b !== undefined) {
				this.sendPenConfig(5, this.penLimits[0]);
			} else if (cmd === "u" && b !== undefined) {
				this.sendPenConfig(4, this.penLimits[1]);
			}
		}
		const duration = Date.now() - t0;
		if (showMetrics) {
			logger.info(`total duration : ${formatDuration(duration)}`);
			logger.info(`total commands : ${numCommands}`);
			logger.info(`pen up/downs   : ${penCommands}`);
			logger.info(`total distance : ${totalDist.toFixed(2)}`);
			logger.info(`draw distance  : ${drawDist.toFixed(2)}`);
		}
		return <Metrics>{
			duration,
			drawDist,
			totalDist,
			penCommands,
			commands: numCommands,
		};
	}

	/**
	 * Syntax sugar for drawing a **single** command only, otherwise same as
	 * {@link AxiDraw.draw}.
	 *
	 * @param cmd
	 */
	draw1(cmd: DrawCommand) {
		return this.draw([cmd], false);
	}

	motorsOn() {
		this.send("EM,1,1\r");
	}

	motorsOff() {
		this.send("EM,0,0\r");
	}

	save() {
		this.opts.logger.debug("saving pen state:", this.penLimits);
		this.penState.push(<[number, number]>this.penLimits.slice());
	}

	restore() {
		if (this.penState.length < 2) {
			this.opts.logger.warn("stack underflow, can't restore pen state");
			return;
		}
		const [down, up] = (this.penLimits = this.penState.pop()!);
		this.sendPenConfig(4, up);
		this.sendPenConfig(5, down);
		this.opts.logger.debug("restored pen state:", this.penLimits);
	}

	penConfig(down?: number, up?: number) {
		up = up !== undefined ? up : this.opts.up;
		this.sendPenConfig(4, up);
		this.penLimits[1] = up;
		down = down !== undefined ? down : this.opts.down;
		this.sendPenConfig(5, down);
		this.penLimits[0] = down;
		// TODO: Set pen lift servo rate (11 & 12) depending on penlift options setting
		this.send(`SC,10,65535\r`);
	}

	penUp(delay?: number, level?: number) {
		if (level !== undefined) this.sendPenConfig(4, level);
		delay = delay !== undefined && delay >= 0 ? delay : this.opts.delayUp;
		this.send(`SP,1,${delay}\r`);
		this.isPenDown = false;
		return delay;
	}

	penDown(delay?: number, level?: number) {
		if (level !== undefined) this.sendPenConfig(5, level);
		delay = delay !== undefined && delay >= 0 ? delay : this.opts.delayDown;
		this.send(`SP,0,${delay}\r`);
		this.isPenDown = true;
		return delay;
	}

	/**
	 * Sends a "moveto" command (absolute coords). Returns tuple of `[duration,
	 * distance]` (distance in original/configured units)
	 *
	 * @remarks
	 * Even though this method accepts absolute coords, all AxiDraw movements
	 * are relative. Depending on pen up/down state, movement speed will be
	 * either the configured {@link AxiDrawOpts.speedDown} or
	 * {@link AxiDrawOpts.speedUp}.
	 *
	 * @param p
	 * @param tempo
	 */
	moveTo(p: ReadonlyVec, tempo?: number) {
		const { homePos, scale, targetPos } = this;
		// apply scale factor: worldspace units -> motor steps, add home offset
		maddN2(targetPos, p, scale, homePos);
		return this.sendMove(tempo);
	}

	/**
	 * Similar to {@link AxiDraw.moveTo}, but using **relative** coordinates.
	 *
	 * @param delta
	 * @param tempo
	 */
	moveRelative(delta: ReadonlyVec, tempo?: number) {
		const { pos, scale, targetPos } = this;
		// apply scale factor: worldspace units -> motor steps
		maddN2(targetPos, delta, scale, pos);
		return this.sendMove(tempo);
	}

	/**
	 * Syntax sugar for {@link AxiDraw.moveTo}([0, 0]).
	 */
	home() {
		return this.moveTo(ZERO2);
	}

	setHome(pos: ReadonlyVec) {
		this.homePos = mulN2([], pos, this.scale);
		this.opts.logger.debug("setting home position:", pos);
	}

	protected async onSignal() {
		this.opts.logger.warn(`SIGNINT received, stop drawing...`);
		this.penUp(0);
		this.motorsOff();
		await delayed(0, 100);
		process.exit(1);
	}

	protected send(msg: string) {
		this.opts.logger.debug(msg);
		this.serial.write(msg);
	}

	protected sendMove(tempo = 1) {
		const { bounds, pos, scale, targetPos, opts, isPenDown } = this;
		if (bounds) clamp2(null, targetPos, ...bounds);
		const delta = sub2([], targetPos, pos);
		set2(pos, targetPos);
		const maxAxis = Math.max(...abs2([], delta));
		const duration =
			(1000 * maxAxis) /
			((isPenDown ? opts.speedDown : opts.speedUp) * tempo);
		this.send(`XM,${duration | 0},${delta[0] | 0},${delta[1] | 0}\r`);
		return [duration, mag(delta) / scale];
	}

	/**
	 * Sends pen up/down config
	 *
	 * @remarks
	 * Reference:
	 * - https://github.com/evil-mad/AxiDraw-Processing/blob/80d81a8c897b8a1872b0555af52a8d1b5b13cec4/AxiGen1/AxiGen1.pde#L213
	 *
	 * @param id
	 * @param x
	 */
	protected sendPenConfig(id: number, x: number) {
		let servo_max = this.opts.servo_max;
		let servo_min = this.opts.servo_min;
		let servo_sweep_time = this.opts.servo_sweep_time;
		if (this.opts.penlift === 3) {
			servo_max = this.opts.nb_servo_max;
			servo_min = this.opts.nb_servo_min;
			servo_sweep_time = this.opts.nb_servo_sweep_time;
		}


		this.send(`SC,${id},${(7500 + 175 * x) | 0}\r`);
	}

}
