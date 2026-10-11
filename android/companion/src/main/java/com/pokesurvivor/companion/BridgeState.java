package com.pokesurvivor.companion;

import org.json.*;
import java.util.*;

/** Bounded, acknowledged actions and transient run state; no account/save storage. */
public final class BridgeState {
    public static final class Busy extends Exception { }
    private String owner="";
    private long lastExchange=-10000,lastInput=-10000,nextID;
    private JSONObject summary=new JSONObject();
    private JSONArray latest=new JSONArray();
    private final ArrayDeque<JSONArray> edges=new ArrayDeque<>();
    private final LinkedHashMap<Long,Pending> pending=new LinkedHashMap<>();
    private record Pending(String action,String screen,long when) { }
    private static final Set<String> ACTIONS=new HashSet<>(Arrays.asList("slot1","slot2","slot3","slot4","prev","next","pause","confirm","cancel","up","down","left","right"));
    public BridgeState(long seed) {nextID=seed;}
    private static String text(JSONObject o,String k,int n){String s=o.optString(k,"");return s.substring(0,Math.min(s.length(),n));}
    private static double number(JSONObject o,String k){double n=o.optDouble(k,0);return Double.isFinite(n)?Math.max(-1e9,Math.min(1e9,n)):0;}
    public synchronized JSONObject exchange(String body,long now) throws JSONException,Busy {
        JSONObject request=new JSONObject(body),raw=request.getJSONObject("snapshot");
        String client=text(request,"client",64);
        if(client.isEmpty()||!client.matches("[A-Za-z0-9-]+")||raw.optInt("version")!=1)throw new JSONException("Invalid protocol");
        if(!owner.equals(client)) {
            if(!owner.isEmpty()&&now-lastExchange<2000)throw new Busy();
            owner=client;pending.clear();edges.clear();latest=new JSONArray();lastInput=-10000;
        }
        lastExchange=now;
        JSONObject safe=new JSONObject().put("version",1).put("visible",raw.optBoolean("visible",false));
        for(String k:new String[]{"state","screen","focus","name"})safe.put(k,text(raw,k,100));
        for(String k:new String[]{"hp","maxHp","level","seconds","active"})safe.put(k,number(raw,k));
        JSONArray moves=new JSONArray(),rawMoves=raw.optJSONArray("moves");
        for(int i=0;i<4;i++){String n=rawMoves==null?"":rawMoves.optString(i,"");moves.put(n.substring(0,Math.min(n.length(),100)));}
        safe.put("moves",moves);summary=safe;
        JSONArray acks=request.optJSONArray("acks");
        if(acks!=null)for(int i=0;i<Math.min(64,acks.length());i++)pending.remove(acks.optLong(i,-1));
        pending.values().removeIf(p->now-p.when>1000);
        JSONArray commands=new JSONArray();
        for(Map.Entry<Long,Pending> e:pending.entrySet())commands.put(new JSONObject().put("id",e.getKey()).put("action",e.getValue().action).put("screen",e.getValue().screen).put("age",now-e.getValue().when));
        if(now-lastInput>500||!safe.optBoolean("visible")){latest=new JSONArray();edges.clear();}
        JSONArray frames=new JSONArray();
        while(!edges.isEmpty())frames.put(edges.removeFirst());
        if(frames.length()==0||!frames.getJSONArray(frames.length()-1).toString().equals(latest.toString()))frames.put(latest);
        return new JSONObject().put("connected",true).put("commands",commands).put("frames",frames);
    }
    public synchronized boolean command(String action,long now) {
        if(!ACTIONS.contains(action)||!connected(now)||pending.size()>=32)return false;
        pending.put(++nextID,new Pending(action,summary.optString("screen",""),now));return true;
    }
    public synchronized void input(JSONArray pads,boolean discrete,long now) {
        latest=pads;lastInput=now;
        if(discrete){if(edges.size()>=64){edges.clear();latest=new JSONArray();return;}edges.addLast(pads);}
    }
    public synchronized boolean connected(long now) {return now-lastExchange<500&&summary.optBoolean("visible",false);}
    public synchronized JSONObject summary() {try{return new JSONObject(summary.toString());}catch(JSONException e){return new JSONObject();}}
}
