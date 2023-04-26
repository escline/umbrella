/**
 * Classes for managing AxiDraw pen vertical motion and status,
 * plus keeping track of overall XYZ pen position.
 */

import type { AxiDraw } from "./axidraw";

/**
 * Data storage class to hold XYZ pen position
 */
export class PenPosition {
    xpos: number;
    ypos: number;
    z_up?: boolean;

    constructor() {
        this.xpos = 0;
        this.ypos = 0;
    }

    reset() {
        this.xpos = 0;
        this.ypos = 0;
        this.z_up = undefined;
    }

    reset_z() {
        this.z_up = undefined;
    }

}

/**
 * Class to calculate and store time required for pen to lift and lower
 */
export class PenLiftTiming {
    raise_time?: number;
    lower_time?: number;

    constructor() {
        this.raise_time = undefined;
        this.lower_time = undefined;
    }

    /**
     * Compute travel time needed for raising and lowering the pen.
     * 
     * Call this method after changing option values to update pen timing
     * settings.
     * 
     * Servo travel time is estimated as the 4th power average (a smooth blend
     * between):
     * (A) Servo transit time for fast servo sweeps
     *      (t = slope * v_dist + min)
     *  and
     * (B) Sweep time for slow sweeps
     *      (t = v_dist * full_scale_sweep_time / sweep_rate)
     * 
     * @param adRef Reference to AxiDraw instance
     * @param narrow_band Pen lift servo narrow-band?
     * @param pen_down_pos
     */
    update(adRef: AxiDraw, narrow_band: boolean, pen_down_pos: number) {
        const v_dist = Math.abs(adRef.opts.up - pen_down_pos);

        let servo_move_slope;
        let servo_move_min;
        let servo_sweep_time;
        if (narrow_band) {
            servo_move_slope = adRef.opts.nb_servo_move_slope;
            servo_move_min = adRef.opts.nb_servo_move_min;
            servo_sweep_time = adRef.opts.nb_servo_sweep_time;
        } else {
            servo_move_slope = adRef.opts.servo_move_slope;
            servo_move_min = adRef.opts.servo_move_min;
            servo_sweep_time = adRef.opts.servo_sweep_time;
        }

        let v_time;

        // Raising time
        v_time = Math.trunc(((servo_move_slope * v_dist + servo_move_min)
            ** 4 + (servo_sweep_time * v_dist / adRef.opts.upRate) ** 4) ** 0.25);

        // If up and down positions are equal, no initial delay
        if (v_dist < 0.9) v_time = 0;

        v_time += adRef.opts.delayUp;
        v_time = Math.max(0, v_time); // Do not allow negative total delay time
        this.raise_time = v_time;

        // Lowering time
        v_time = Math.trunc(((servo_move_slope * v_dist + servo_move_min)
            ** 4 + (servo_sweep_time * v_dist / adRef.opts.downRate) ** 4) ** 0.25);

        // If up and down positions are equal, no initial delay
        if (v_dist < 0.9) v_time = 0;

        v_time += adRef.opts.delayDown;
        v_time = Math.max(0, v_time); // Do not allow negative total delay time
        this.lower_time = v_time;

    }

}

/**
 * Manage pen-down height settings and keep timing up to date.
 * Calculate timing for transiting between pen-up and pen-down states.
 */
export class PenHeight {
    pen_pos_down?: number;
    use_temp_pen_height: boolean;
    narrow_band: boolean;
    times: PenLiftTiming;

    constructor() {
        this.pen_pos_down = undefined;
        this.use_temp_pen_height = false;
        this.narrow_band = false;
        this.times = new PenLiftTiming();
    }
}



/**
 * Main class for managing pen lifting, lowering, and status
 */
export class PenHandler {

}