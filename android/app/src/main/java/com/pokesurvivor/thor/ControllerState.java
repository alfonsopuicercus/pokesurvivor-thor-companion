package com.pokesurvivor.thor;

import java.util.Arrays;

/** Android keys/axes normalized to the browser's standard gamepad layout. */
public final class ControllerState {
    private final boolean[] digital = new boolean[33];
    private final float[] axes = new float[4];
    private float leftTrigger, rightTrigger, hatX, hatY;
    private static final int[] CODES = {96,97,99,100,102,103,104,105,109,108,106,107,19,20,21,22,110};

    public boolean key(int code, boolean down) {
        for (int i=0; i<CODES.length; i++) {
            if (CODES[i] == code) { digital[i] = down; return true; }
        }
        if (code >= 188 && code <= 203) { digital[17+code-188] = down; return true; }
        return false;
    }
    public void motion(float x,float y,float z,float rz,float lt,float rt,float hx,float hy) {
        axes[0]=clamp(x,-1,1); axes[1]=clamp(y,-1,1);
        axes[2]=clamp(z,-1,1); axes[3]=clamp(rz,-1,1);
        leftTrigger=clamp(lt,0,1); rightTrigger=clamp(rt,0,1);
        hatX=clamp(hx,-1,1); hatY=clamp(hy,-1,1);
    }
    private static float clamp(float n,float min,float max) {
        return Float.isFinite(n) ? Math.max(min,Math.min(max,n)) : 0;
    }
    public float axis(int index) { return axes[index]; }
    public float buttonValue(int index) {
        float analog = switch(index) {
            case 6 -> leftTrigger;
            case 7 -> rightTrigger;
            case 12 -> hatY < -.5f ? 1 : 0;
            case 13 -> hatY > .5f ? 1 : 0;
            case 14 -> hatX < -.5f ? 1 : 0;
            case 15 -> hatX > .5f ? 1 : 0;
            default -> 0;
        };
        return Math.max(digital[index] ? 1 : 0,analog);
    }
    public void clear() {
        Arrays.fill(digital,false); Arrays.fill(axes,0);
        leftTrigger=rightTrigger=hatX=hatY=0;
    }
}
