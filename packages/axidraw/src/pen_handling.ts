import { delayed } from "@thi.ng/compose/delayed";

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

    update(adRef: AxiDraw): void {
        /**
         * Set initial/default values of options, after init.
         * Call this method after changing option values to update pen height settings.
         */
        if (!this.use_temp_pen_height) this.pen_pos_down = adRef.opts.down;
        if (this.pen_pos_down) this.times.update(adRef, this.narrow_band, this.pen_pos_down);
    }

    set_temp_height(adRef: AxiDraw, temp_height: number): boolean {
        /**
         * Begin using temporary pen height position.
         * Return True if the position has changed.
         */
        this.use_temp_pen_height = true;
        if (this.pen_pos_down && this.pen_pos_down === temp_height) return false;

        this.pen_pos_down = temp_height

        this.times.update(adRef, this.narrow_band, temp_height);
        return true;
    }

    end_temp_height(adRef: AxiDraw): boolean {
        /**
         * End using temporary pen height position.
         * Return True if the position has changed.
         */
        this.use_temp_pen_height = false;
        if (this.pen_pos_down && this.pen_pos_down === adRef.opts.down) return false;
        this.pen_pos_down = adRef.opts.down;
        this.times.update(adRef, this.narrow_band, this.pen_pos_down);
        return true;
    }
}

/**
 * Data storage class for pen lift status variables
 */
export class PenStatus {
    /**
     * Data storage class for pen lift status variables
     * 
     * pen_up: physical pen up/down state (boolean)
     * preview_pen_state: pen state for preview rendering. 0: down, 1: up,
     *   -1: changed
     * ebblv_set: Boolean; set to True after the pen is physically raised once
     * lifts: Counter; keeps track of the number of times the pen is lifted
     */
    pen_up?: boolean;
    preview_pen_state: number;
    ebblv_set: boolean;
    lifts: number;

    constructor() {
        this.preview_pen_state = -1;
        this.ebblv_set = false;
        this.lifts = 0
    }

    reset(): void {
        /**
         * Clear preview pen state and lift count; Resetting them for
         * a new plot.
         */
        this.preview_pen_state = -1;
        this.lifts = 0;
    }

}

/**
 * Main class for managing pen lifting, lowering, and status,
 * plus keeping track of XYZ pen position.
 */
export class PenHandler {
    heights: PenHeight;
    status: PenStatus;
    phys: PenPosition;
    turtle: PenPosition;

    constructor() {
        this.heights = new PenHeight();
        this.status = new PenStatus();
        this.phys = new PenPosition();
        this.turtle = new PenPosition();
    }

    /**
     * Apply new settings after changing options directly
     * 
     * @param adRef AxiDraw instance
     */
    update(adRef: AxiDraw): void {
        this.heights.update(adRef);
    }

    reset(): void {
        /**
         * Reset certain defaults for a new plot:
         * Clear pen height and lift count; clear temporary pen height flag.
         * These are the defaults that can be set even before options are set.
         */
        this.status.reset()
        this.heights.use_temp_pen_height = false;
    }

    async pen_raise(adRef: AxiDraw): Promise<void> {
        /**
         * Raise the pen
         */
        this.status.preview_pen_state = -1;

        // Skip if physical pen is already up
        if (this.phys.z_up) return;

        this.status.lifts += 1;

        const v_time = this.heights.times.raise_time;

        let servo_pin;
        if (this.heights.narrow_band) {
            // TODO: move these type of options (never changed) to a params object?
            servo_pin = adRef.opts.nb_servo_pin;
        } else {
            servo_pin = adRef.opts.servo_pin;
        }

        // TODO Implement preview option?
        // if (adRef.opts.preview) {
        //     adRef.preview.v_chart.rest(adRef, v_time);
        // } else 
        {
            adRef.sendPenUp(v_time, servo_pin);
            if (v_time && v_time > 50) {
                const wait = Math.max(0, v_time - adRef.opts.preDelay);
                await delayed(0, wait);
            }
        }

        this.phys.z_up = true;

        // if (!this.status.ebblv_set) {
        //     let layer_code = 1 + Math.trunc(adRef.opts.up / 2);
        //     if (this.heights.narrow_band) layer_code += 70;
        // }
    }

    async pen_lower(adRef: AxiDraw): Promise<void> {
        /**
         * Lower the pen
         */
        this.status.preview_pen_state = -1;

        if (this.phys.z_up !== undefined && ! this.phys.z_up) return;

        const v_time = this.heights.times.lower_time;
        
        let servo_pin;
        if (this.heights.narrow_band) {
            // TODO: move these type of options (never changed) to a params object?
            servo_pin = adRef.opts.nb_servo_pin;
        } else {
            servo_pin = adRef.opts.servo_pin;
        }

        // TODO Implement preview option?
        // if (adRef.opts.preview) {
        //     adRef.preview.v_chart.rest(adRef, v_time);
        // } else 
        {
            adRef.sendPenDown(v_time, servo_pin);
            if (v_time && v_time > 50) {
                const wait = Math.max(0, v_time - adRef.opts.preDelay);
                await delayed(0, wait);
            }
        }

        this.phys.z_up = false;
    }

    async toggle(adRef: AxiDraw): Promise<void> {
        /**
         * Toggle the pen from up to down or vice versa, after determining
         * which state it is initially in. Call only after servo_setup_wrapper.
         * This method should only be used as a setup utility.
         */
        if (this.phys.z_up) {
            await this.pen_lower(adRef);
        } else {
            await this.pen_raise(adRef);
        }
    }

    // servo_setup_wrapper(adRef: AxiDraw): void {
    //     /**
    //      * Utility wrapper for servo_setup(), used for the first time that we
    //      * address the pen-lift servo motor. It is used in manual and setup
    //      * modes, as well as in various plotting modes for initial pen
    //      * raising/lowering.
    //      */
    // }
    
    servo_setup(adRef: AxiDraw): void {
        /**
         * Set servo up/down positions, raising/lowering rates, and power
         * timeout.
         * 
         * Pen position units range from 0% to 100%, which correspond to a
         * typical timing range of 9855 - 27831 in units of
         * 83.3 ns (1/(12 MHz)), giving a timing range of 0.82 - 2.32 ms.
         * 
         * Servo rate options (pen_rate_raise, pen_rate_lower) range from
         * 1% to 100%. The EBB servo rate values are in units of 83.3 ns
         * steps per 24 ms. Our servo sweep at 100% rate sweeps over 100%
         * range in servo_sweep_time ms.
         */
        
        // (No current models have narrow_band servos by default)
        if (adRef.opts.penlift == 3) {
            this.heights.narrow_band = true;
        } else {
            this.heights.narrow_band = false;
        }

        this.heights.update(adRef);

        let servo_max;
		let servo_min;
		let servo_sweep_time;
        let pwm_period;
        if (this.heights.narrow_band) {
            servo_max = adRef.opts.nb_servo_max;
			servo_min = adRef.opts.nb_servo_min;
			servo_sweep_time = adRef.opts.nb_servo_sweep_time;
            adRef.setPwmChannels(1);
            // Units are "ms / 100", since pen_rate_raise is a %.
            pwm_period = 0.03;
        } else {
            servo_max = adRef.opts.servo_max;
			servo_min = adRef.opts.servo_min;
			servo_sweep_time = adRef.opts.servo_sweep_time;
            adRef.setPwmChannels(8);
            // 24 ms: 8 channels at 3 ms each (divided by 100 as above)
            pwm_period = 0.24;
        }

        const servo_range = servo_max - servo_min;
        const servo_slope = servo_range / 100.0;
        let int_temp;
        int_temp = Math.round(servo_min + servo_slope * adRef.opts.up);
        adRef.setPenUpPos(int_temp);
        int_temp = Math.round(servo_min + servo_slope * (this.heights.pen_pos_down || adRef.opts.down));
        adRef.setPenDownPos(int_temp);

        const servo_rate_scale = servo_range * pwm_period / servo_sweep_time;

        int_temp = Math.round(servo_rate_scale * adRef.opts.upRate);
        adRef.setPenUpRate(int_temp);

        int_temp = Math.round(servo_rate_scale * adRef.opts.downRate);
        adRef.setPenDownRate(int_temp);

        adRef.servo_timeout(adRef.opts.servo_timeout);

    }
}