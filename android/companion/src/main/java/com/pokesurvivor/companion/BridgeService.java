package com.pokesurvivor.companion;

import android.app.*;
import android.content.Intent;
import android.os.*;
import java.io.IOException;
import java.security.SecureRandom;

/** User-started local link, kept alive while the original game runs in Firefox. */
public final class BridgeService extends Service {
    public final class Link extends Binder {public BridgeService service(){return BridgeService.this;}}
    private final Link binder=new Link();
    public BridgeState state;
    private LoopbackServer server;
    public String key,error="";
    public static long now(){return SystemClock.elapsedRealtime();}
    @Override public void onCreate(){
        super.onCreate();state=new BridgeState(System.currentTimeMillis()*1000);
        key=getSharedPreferences("pairing",MODE_PRIVATE).getString("key","");
        if(!key.matches("[a-f0-9]{64}")){
            byte[] random=new byte[32];new SecureRandom().nextBytes(random);StringBuilder hex=new StringBuilder();
            for(byte b:random)hex.append(String.format(java.util.Locale.ROOT,"%02x",b&255));key=hex.toString();
            getSharedPreferences("pairing",MODE_PRIVATE).edit().putString("key",key).apply();
        }
        NotificationManager manager=getSystemService(NotificationManager.class);
        manager.createNotificationChannel(new NotificationChannel("link","Thor game connection",NotificationManager.IMPORTANCE_LOW));
    }
    private Notification notification(){
        PendingIntent open=PendingIntent.getActivity(this,1,new Intent(this,PanelActivity.class),PendingIntent.FLAG_IMMUTABLE|PendingIntent.FLAG_UPDATE_CURRENT);
        PendingIntent stop=PendingIntent.getService(this,2,new Intent(this,BridgeService.class).setAction("STOP"),PendingIntent.FLAG_IMMUTABLE);
        return new Notification.Builder(this,"link").setSmallIcon(android.R.drawable.ic_media_play)
            .setContentTitle("PokéSurvivor Thor panel").setContentText("Local connection active. Open Firefox to play.")
            .setContentIntent(open).setOngoing(true).addAction(new Notification.Action.Builder(null,"Stop",stop).build()).build();
    }
    @Override public int onStartCommand(Intent intent,int flags,int id){
        if(intent!=null&&"STOP".equals(intent.getAction())){closeLink();stopSelf();return START_NOT_STICKY;}
        if(state==null)state=new BridgeState(System.currentTimeMillis()*1000);
        startForeground(3,notification());
        if(server==null)try{
            error="";
            server=new LoopbackServer(28765,key,body->{
                try{return new LoopbackServer.Result(200,state.exchange(body,now()).toString());}
                catch(BridgeState.Busy busy){return new LoopbackServer.Result(409,"{}");}
            });server.start();
        }catch(IOException e){error="Local port is busy. Stop another Thor companion and reopen this app.";}
        return START_NOT_STICKY;
    }
    @Override public IBinder onBind(Intent intent){return binder;}
    private void closeLink(){if(server!=null)server.close();server=null;state=null;stopForeground(STOP_FOREGROUND_REMOVE);}
    @Override public void onTimeout(int startId,int fgsType){closeLink();stopSelf();}
    @Override public void onDestroy(){closeLink();super.onDestroy();}
}
