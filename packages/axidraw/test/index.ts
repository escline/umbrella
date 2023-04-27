import { group } from "@thi.ng/testament";
import { eqDelta } from "@thi.ng/math";
import * as assert from "assert";
import {
	AxiDraw,
	DOWN,
	MockSerial,
	MOCK_SERIAL,
	MOVE,
	UP,
} from "../src/index.js";

group(
	"axidraw - standard servo",
	{
		"square + diagonals": async (ctx) => {
			const axi = new AxiDraw({
				serial: MOCK_SERIAL,
				sigint: false,
			});
			await axi.connect("/foo");
			const metrics = await axi.draw([
				MOVE([0, 0]),
				DOWN(),
				MOVE([100, 0]),
				MOVE([100, 100]),
				MOVE([0, 100]),
				MOVE([0, 0]),
				UP(),
				MOVE([0, 0]),
				DOWN(),
				MOVE([100, 100]),
				UP(),
				MOVE([100, 0]),
				DOWN(),
				MOVE([0, 100]),
				UP(),
			]);
			const sent = (<MockSerial>axi.serial).sent;
			const dist = 4 * 100 + 2 * Math.hypot(100, 100);
			assert.ok(eqDelta(metrics.drawDist, dist, 1e-3));
			assert.ok(eqDelta(metrics.totalDist, dist + 2 * 100, 1e-3));
			assert.strictEqual(metrics.penCommands, 8);
			assert.strictEqual(metrics.commands, 25);
			assert.strictEqual(metrics.commands, sent.length);
			assert.deepStrictEqual(sent, [
				"EM,1,1\r",
				"SC,8,8\r",
				"SC,4,20641\r",
				"SC,5,15248\r",
				"SC,11,1618\r",
				"SC,12,1079\r",
				"SR,60000\r",
				"SP,1,130,1\r",
				"XM,0,0,0\r",
				"SP,0,146,1\r",
				"XM,2000,8000,0\r",
				"XM,2000,0,8000\r",
				"XM,2000,-8000,0\r",
				"XM,2000,0,-8000\r",
				"SP,1,130,1\r",
				"XM,0,0,0\r",
				"SP,0,146,1\r",
				"XM,2000,8000,8000\r",
				"SP,1,130,1\r",
				"XM,2000,0,-8000\r",
				"SP,0,146,1\r",
				"XM,2000,-8000,8000\r",
				"SP,1,130,1\r",
				"XM,2000,0,-8000\r",
				"EM,0,0\r",
			]);
			ctx.done();
		},
	},
	{ timeOut: 20000 }
);

group(
	"axidraw - brushless servo",
	{
		"brushless servo - square + diagonals": async (ctx) => {
			const axi = new AxiDraw({
				serial: MOCK_SERIAL,
				sigint: false,
				penlift: 3,
			});
			await axi.connect("/foo");
			const metrics = await axi.draw([
				MOVE([0, 0]),
				DOWN(),
				MOVE([100, 0]),
				MOVE([100, 100]),
				MOVE([0, 100]),
				MOVE([0, 0]),
				UP(),
				MOVE([0, 0]),
				DOWN(),
				MOVE([100, 100]),
				UP(),
				MOVE([100, 0]),
				DOWN(),
				MOVE([0, 100]),
				UP(),
			]);
			const sent = (<MockSerial>axi.serial).sent;
			const dist = 4 * 100 + 2 * Math.hypot(100, 100);
			assert.ok(eqDelta(metrics.drawDist, dist, 1e-3));
			assert.ok(eqDelta(metrics.totalDist, dist + 2 * 100, 1e-3));
			assert.strictEqual(metrics.penCommands, 8);
			assert.strictEqual(metrics.commands, 25);
			assert.strictEqual(metrics.commands, sent.length);
			assert.deepStrictEqual(sent, [
                "EM,1,1\r",
                "SC,8,1\r",
				"SC,4,9720\r",
				"SC,5,7560\r",
				"SC,11,231\r",
				"SC,12,154\r",
				"SR,60000\r",
				"SP,1,59,2\r",
				"XM,0,0,0\r",
				"SP,0,61,2\r",
				"XM,2000,8000,0\r",
				"XM,2000,0,8000\r",
				"XM,2000,-8000,0\r",
				"XM,2000,0,-8000\r",
				"SP,1,59,2\r",
				"XM,0,0,0\r",
				"SP,0,61,2\r",
				"XM,2000,8000,8000\r",
				"SP,1,59,2\r",
				"XM,2000,0,-8000\r",
				"SP,0,61,2\r",
				"XM,2000,-8000,8000\r",
				"SP,1,59,2\r",
				"XM,2000,0,-8000\r",
				"EM,0,0\r",
			]);
			ctx.done();
		},
	},
	{ timeOut: 20000 }
);
