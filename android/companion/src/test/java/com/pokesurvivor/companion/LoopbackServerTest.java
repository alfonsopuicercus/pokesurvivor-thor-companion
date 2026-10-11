package com.pokesurvivor.companion;
import org.junit.Test;
import java.net.*;
import java.io.*;
import java.nio.charset.StandardCharsets;
import static org.junit.Assert.*;

public class LoopbackServerTest {
    private String request(LoopbackServer s,String headers,String body)throws Exception{
        try(Socket c=new Socket("127.0.0.1",s.port())) {
            c.setSoTimeout(2000);String raw="POST /exchange HTTP/1.1\r\nHost: 127.0.0.1:"+s.port()+"\r\nContent-Type: application/json\r\n"+headers+"Content-Length: "+body.length()+"\r\n\r\n"+body;
            c.getOutputStream().write(raw.getBytes(StandardCharsets.UTF_8));c.shutdownOutput();return new String(c.getInputStream().readAllBytes(),StandardCharsets.UTF_8);
        }
    }
    @Test public void authenticatedLocalPostOnlyAndBoundedBodies() throws Exception {
        try(LoopbackServer s=new LoopbackServer(0,"test-key",body->new LoopbackServer.Result(200,"{}"))) {
            s.start();assertTrue(request(s,"Authorization: Bearer test-key\r\n","{}").startsWith("HTTP/1.1 200"));
            assertTrue(request(s,"Authorization: Bearer wrong\r\n","{}").startsWith("HTTP/1.1 401"));
            assertTrue(request(s,"Authorization: Bearer test-key\r\nOrigin: https://evil.example\r\n","{}").startsWith("HTTP/1.1 403"));
            assertTrue(request(s,"Authorization: Bearer test-key\r\n"," ".repeat(32769)).startsWith("HTTP/1.1 413"));
            assertTrue(s.address().isLoopbackAddress());
        }
    }
}
