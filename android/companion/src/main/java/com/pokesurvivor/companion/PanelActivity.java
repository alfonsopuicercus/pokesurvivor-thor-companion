package com.pokesurvivor.companion;

import android.app.*;
import android.content.*;
import android.hardware.display.DisplayManager;
import android.hardware.input.InputManager;
import android.net.Uri;
import android.os.*;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.util.*;
import com.pokesurvivor.thor.ControllerState;

/** Native second-screen UI. Google sign-in and gameplay stay in the real browser. */
public final class PanelActivity extends Activity implements InputManager.InputDeviceListener {
    private final Handler handler=new Handler(Looper.getMainLooper());
    private final Map<Integer,ControllerState> controllers=new LinkedHashMap<>();
    private BridgeService bridge;
    private boolean bound,foreground;
    private InputManager input;
    private TextView status,run,focus;
    private Button pause;
    private final Button[] slots=new Button[4];
    private LinearLayout box;
    private List<Display> displays;
    private final ServiceConnection connection=new ServiceConnection(){
        public void onServiceConnected(ComponentName name,IBinder binder){bridge=((BridgeService.Link)binder).service();emit(true);}
        public void onServiceDisconnected(ComponentName name){bridge=null;}
    };
    private final Runnable tick=new Runnable(){public void run(){render();if(foreground&&hasWindowFocus())emit(false);handler.postDelayed(this,100);}};
    @Override public void onCreate(Bundle saved){
        super.onCreate(saved);
        DisplayManager dm=getSystemService(DisplayManager.class);displays=Arrays.asList(dm.getDisplays());
        Display current=getWindowManager().getDefaultDisplay();
        if(!getIntent().getBooleanExtra("placed",false)&&current.getDisplayId()==Display.DEFAULT_DISPLAY){
            for(Display d:displays)if(d.getDisplayId()!=Display.DEFAULT_DISPLAY&&d.getState()!=Display.STATE_OFF){if(place(d.getDisplayId())){finish();return;}break;}
        }
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);
        ScrollView scroll=new ScrollView(this);box=new LinearLayout(this);box.setOrientation(LinearLayout.VERTICAL);box.setPadding(dp(16),dp(12),dp(16),dp(16));box.setBackgroundColor(0xff0d1728);scroll.addView(box);setContentView(scroll);
        label("PokéSurvivor · Thor panel",24);status=label("Starting local connection…",16);run=label("Open the official game in Firefox",21);focus=label("",16);
        LinearLayout move1=row(),move2=row();for(int n=0;n<4;n++){final int slot=n;slots[n]=button(n<2?move1:move2,"Move "+(n+1),()->command("slot"+(slot+1)));}
        LinearLayout actions=row();button(actions,"Previous",()->command("prev"));pause=button(actions,"Pause",()->command("pause"));button(actions,"Next",()->command("next"));
        LinearLayout vertical=row();button(vertical,"↑",()->command("up"));button(vertical,"Confirm",()->command("confirm"));button(vertical,"↓",()->command("down"));
        LinearLayout horizontal=row();button(horizontal,"←",()->command("left"));button(horizontal,"Back",()->command("cancel"));button(horizontal,"→",()->command("right"));
        label("First setup: install both scripts in Firefox / Violentmonkey, copy the pairing key, then choose Connect Thor panel in the userscript menu.",15);
        LinearLayout setup=row();button(setup,"Copy pairing key",this::copyKey);button(setup,"Open game",this::openGame);
        if(displays.size()>1){
            Spinner selector=new Spinner(this);List<String> names=new ArrayList<>();for(Display d:displays)names.add("Display "+d.getDisplayId()+" · "+d.getName());
            selector.setAdapter(new ArrayAdapter<>(this,android.R.layout.simple_spinner_dropdown_item,names));for(int n=0;n<displays.size();n++)if(displays.get(n).getDisplayId()==current.getDisplayId())selector.setSelection(n);box.addView(selector);
            button(row(),"Move panel to selected screen",()->{int id=displays.get(selector.getSelectedItemPosition()).getDisplayId();if(id!=getWindowManager().getDefaultDisplay().getDisplayId()&&place(id))finish();});
        }
        button(row(),"Stop companion",()->{stopService(new Intent(this,BridgeService.class));finish();});
        if(Build.VERSION.SDK_INT>=33&&checkSelfPermission(android.Manifest.permission.POST_NOTIFICATIONS)!=android.content.pm.PackageManager.PERMISSION_GRANTED)requestPermissions(new String[]{android.Manifest.permission.POST_NOTIFICATIONS},4);
        startForegroundService(new Intent(this,BridgeService.class));bound=bindService(new Intent(this,BridgeService.class),connection,BIND_AUTO_CREATE);
        input=getSystemService(InputManager.class);input.registerInputDeviceListener(this,handler);for(int id:input.getInputDeviceIds())onInputDeviceAdded(id);
        handler.post(tick);immersive();
    }
    private int dp(int n){return Math.round(n*getResources().getDisplayMetrics().density);}
    private TextView label(String text,int size){TextView v=new TextView(this);v.setText(text);v.setTextSize(size);v.setTextColor(0xffe7efff);v.setPadding(0,dp(5),0,dp(5));box.addView(v);return v;}
    private LinearLayout row(){LinearLayout r=new LinearLayout(this);box.addView(r);return r;}
    private Button button(LinearLayout row,String text,Runnable action){Button b=new Button(this);b.setText(text);b.setAllCaps(false);b.setTextSize(17);row.addView(b,new LinearLayout.LayoutParams(0,ViewGroup.LayoutParams.WRAP_CONTENT,1));b.setOnClickListener(v->action.run());return b;}
    private boolean place(int id){try{Intent intent=new Intent(this,PanelActivity.class).putExtra("placed",true).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK|Intent.FLAG_ACTIVITY_MULTIPLE_TASK);
        startActivity(intent,ActivityOptions.makeBasic().setLaunchDisplayId(id).toBundle());return true;
    }catch(RuntimeException e){Toast.makeText(this,"Screen placement unavailable; use Thor's app screen selector.",Toast.LENGTH_LONG).show();return false;}}
    private void openGame(){try{
        Intent intent=new Intent(Intent.ACTION_VIEW,Uri.parse("https://pokesurvivor.com/en/")).setPackage("org.mozilla.firefox").addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        startActivity(intent,ActivityOptions.makeBasic().setLaunchDisplayId(Display.DEFAULT_DISPLAY).toBundle());
    }catch(RuntimeException e){new AlertDialog.Builder(this).setMessage("Install Firefox for Android, then open pokesurvivor.com there. The panel will stay available on the other screen.").setPositiveButton("OK",null).show();}}
    private void copyKey(){if(bridge==null)return;ClipData clip=ClipData.newPlainText("Thor pairing key",bridge.key);
        if(Build.VERSION.SDK_INT>=33){PersistableBundle extras=new PersistableBundle();extras.putBoolean(ClipDescription.EXTRA_IS_SENSITIVE,true);clip.getDescription().setExtras(extras);}
        getSystemService(ClipboardManager.class).setPrimaryClip(clip);Toast.makeText(this,"Pairing key copied. Paste it into Connect Thor panel in Violentmonkey.",Toast.LENGTH_LONG).show();}
    private void command(String action){if(bridge==null||bridge.state==null||!bridge.state.command(action,BridgeService.now()))Toast.makeText(this,"Open the game and connect the scripts first.",Toast.LENGTH_SHORT).show();}
    private void render(){if(bridge==null)return;if(bridge.state==null){status.setText("Connection stopped · reopen the panel to connect");pause.setEnabled(false);for(Button slot:slots)slot.setEnabled(false);return;}JSONObject s=bridge.state.summary();boolean live=bridge.state.connected(BridgeService.now());
        status.setText(!bridge.error.isEmpty()?bridge.error:live?"Connected · official online game":"Waiting for paired Firefox game");
        String state=s.optString("state","");run.setText(live?s.optString("name","")+" · Lv "+s.optInt("level")+" · HP "+Math.round(s.optDouble("hp",0))+" / "+Math.round(s.optDouble("maxHp",0))+"\n"+state+" · "+Math.max(0,s.optInt("seconds"))+"s":"Sign in and play on the top screen");
        String screen=s.optString("screen","");focus.setText(live&& !screen.isEmpty()?screen+"\n"+s.optString("focus",""):"Stick / D-pad moves · face buttons select moves");
        JSONArray moves=s.optJSONArray("moves");for(int n=0;n<4;n++){String name=moves==null?"":moves.optString(n,"");slots[n].setText((s.optInt("active",-1)==n?"● ":"")+(name.isEmpty()?"Move "+(n+1):name));slots[n].setEnabled(live&&"playing".equals(state)&&screen.isEmpty()&&!name.isEmpty());}
        pause.setText("scr-pause".equals(screen)?"Resume":"Pause");pause.setEnabled(live);
    }
    private static boolean source(int value){return(value&InputDevice.SOURCE_GAMEPAD)==InputDevice.SOURCE_GAMEPAD||(value&InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK||(value&InputDevice.SOURCE_DPAD)==InputDevice.SOURCE_DPAD;}
    private ControllerState controller(int id){if(!controllers.containsKey(id)){controllers.put(id,new ControllerState());emit(true);}return controllers.get(id);}
    @Override public boolean dispatchKeyEvent(KeyEvent e){if(source(e.getSource())){
        if(e.getKeyCode()==KeyEvent.KEYCODE_BACK){if(e.getAction()==KeyEvent.ACTION_UP)command("cancel");return true;}
        if(e.getRepeatCount()>0)return true;
        if(controller(e.getDeviceId()).key(e.getKeyCode(),e.getAction()==KeyEvent.ACTION_DOWN)){emit(true);return true;}
    }return super.dispatchKeyEvent(e);}
    private static float axis(MotionEvent e,int id){InputDevice d=e.getDevice();InputDevice.MotionRange r=d==null?null:d.getMotionRange(id,e.getSource());float v=e.getAxisValue(id);return r!=null&&Math.abs(v)<=r.getFlat()?0:v;}
    private static float trigger(MotionEvent e,int primary,int fallback){InputDevice d=e.getDevice();InputDevice.MotionRange r=d==null?null:d.getMotionRange(primary,e.getSource());int id=primary;if(r==null&&d!=null){r=d.getMotionRange(fallback,e.getSource());id=fallback;}float v=e.getAxisValue(id);return r!=null&&r.getMax()>r.getMin()?(v-r.getMin())/(r.getMax()-r.getMin()):Math.max(0,v);}
    @Override public boolean dispatchGenericMotionEvent(MotionEvent e){if((e.getSource()&InputDevice.SOURCE_JOYSTICK)==InputDevice.SOURCE_JOYSTICK&&e.getAction()==MotionEvent.ACTION_MOVE){ControllerState s=controller(e.getDeviceId());
        boolean[] before=new boolean[33];for(int n=0;n<33;n++)before[n]=s.buttonValue(n)>=.5;
        s.motion(axis(e,MotionEvent.AXIS_X),axis(e,MotionEvent.AXIS_Y),axis(e,MotionEvent.AXIS_Z),axis(e,MotionEvent.AXIS_RZ),trigger(e,MotionEvent.AXIS_LTRIGGER,MotionEvent.AXIS_BRAKE),trigger(e,MotionEvent.AXIS_RTRIGGER,MotionEvent.AXIS_GAS),e.getAxisValue(MotionEvent.AXIS_HAT_X),e.getAxisValue(MotionEvent.AXIS_HAT_Y));
        boolean edge=false;for(int n=0;n<33;n++)if(before[n]!=(s.buttonValue(n)>=.5))edge=true;emit(edge);return true;
    }return super.dispatchGenericMotionEvent(e);}
    private void emit(boolean discrete){if(bridge==null||bridge.state==null)return;JSONArray pads=new JSONArray();try{
        if(foreground&&hasWindowFocus())for(Map.Entry<Integer,ControllerState> entry:controllers.entrySet()){ControllerState s=entry.getValue();InputDevice d=InputDevice.getDevice(entry.getKey());JSONArray axes=new JSONArray(),buttons=new JSONArray();for(int n=0;n<4;n++)axes.put(s.axis(n));for(int n=0;n<33;n++)buttons.put(new JSONObject().put("value",s.buttonValue(n)));pads.put(new JSONObject().put("id",d==null?"Native pad":d.getName()).put("axes",axes).put("buttons",buttons));}
        bridge.state.input(pads,discrete,BridgeService.now());
    }catch(JSONException ignored){}}
    private void clear(){for(ControllerState s:controllers.values())s.clear();if(bridge!=null&&bridge.state!=null)bridge.state.input(new JSONArray(),true,BridgeService.now());}
    private void immersive(){getWindow().getDecorView().setSystemUiVisibility(View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY|View.SYSTEM_UI_FLAG_FULLSCREEN|View.SYSTEM_UI_FLAG_HIDE_NAVIGATION);}
    @Override protected void onResume(){super.onResume();foreground=true;immersive();emit(true);}
    @Override protected void onPause(){foreground=false;clear();super.onPause();}
    @Override public void onWindowFocusChanged(boolean hasFocus){super.onWindowFocusChanged(hasFocus);if(!hasFocus)clear();else{immersive();emit(true);}}
    @Override public void onBackPressed(){command("cancel");}
    @Override public void onInputDeviceAdded(int id){InputDevice d=InputDevice.getDevice(id);if(d!=null&&source(d.getSources()))controller(id);}
    @Override public void onInputDeviceRemoved(int id){controllers.remove(id);clear();}
    @Override public void onInputDeviceChanged(int id){onInputDeviceRemoved(id);onInputDeviceAdded(id);}
    @Override protected void onDestroy(){handler.removeCallbacksAndMessages(null);clear();if(input!=null)input.unregisterInputDeviceListener(this);if(bound)unbindService(connection);bridge=null;super.onDestroy();}
}
