package com.pokesurvivor.companion;
import org.junit.Test;
import org.json.*;
import static org.junit.Assert.*;

public class BridgeStateTest {
    private String exchange(String client,String screen,long ack) throws Exception {
        return new JSONObject().put("client",client).put("snapshot",new JSONObject().put("version",1).put("visible",true).put("screen",screen).put("state","playing").put("secret","PRIVATE").put("moves",new JSONArray().put("Tackle")))
            .put("acks",new JSONArray().put(ack)).toString();
    }
    @Test public void commandsSurviveLostResponsesThenAckOrExpire() throws Exception {
        BridgeState s=new BridgeState(1000);s.exchange(exchange("first","",0),1000);
        assertTrue(s.command("slot2",1001));
        JSONObject a=s.exchange(exchange("first","",0),1002);long id=a.getJSONArray("commands").getJSONObject(0).getLong("id");
        assertEquals(1,s.exchange(exchange("first","",0),1100).getJSONArray("commands").length());
        assertEquals(0,s.exchange(exchange("first","",id),1101).getJSONArray("commands").length());
        assertTrue(s.command("pause",1102));assertEquals(0,s.exchange(exchange("first","",0),2103).getJSONArray("commands").length());
        assertFalse(s.command("deleteAccount",2104));assertFalse(s.summary().toString().contains("PRIVATE"));
    }
    @Test public void onlyOneLiveTabOwnsStateAndTakeoverClearsInputs() throws Exception {
        BridgeState s=new BridgeState(1);s.exchange(exchange("first","scr-menu",0),10);
        try{s.exchange(exchange("second","",0),20);fail();}catch(BridgeState.Busy expected){}
        s.input(new JSONArray().put(new JSONObject().put("id","test").put("axes",new JSONArray().put(1)).put("buttons",new JSONArray())),true,30);
        assertEquals(0,s.exchange(exchange("second","",0),2011).getJSONArray("frames").getJSONArray(0).length());
    }
    @Test public void quickPressReleaseFramesArePreservedAndDisconnectedPanelsExpire() throws Exception {
        BridgeState s=new BridgeState(1);s.exchange(exchange("first","",0),1);
        s.input(new JSONArray().put(new JSONObject().put("press",true)),true,2);s.input(new JSONArray(),true,3);
        assertEquals(2,s.exchange(exchange("first","",0),4).getJSONArray("frames").length());
        s.input(new JSONArray().put(new JSONObject().put("press",true)),false,5);
        assertEquals(0,s.exchange(exchange("first","",0),506).getJSONArray("frames").getJSONArray(0).length());
    }
}
