package com.pokesurvivor.companion;

import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.*;
import java.util.concurrent.*;

/** Small HTTP endpoint bound only to IPv4 loopback; no static files or GET routes. */
public final class LoopbackServer implements AutoCloseable {
    public record Result(int status,String body) { }
    public interface Handler { Result exchange(String body) throws Exception; }
    private final ServerSocket listener;
    private final byte[] authorization;
    private final Handler handler;
    private final Set<Socket> active=ConcurrentHashMap.newKeySet();
    private final ThreadPoolExecutor workers=new ThreadPoolExecutor(2,2,0,TimeUnit.SECONDS,new ArrayBlockingQueue<>(8),r->{Thread t=new Thread(r,"Thor request");t.setDaemon(true);return t;});
    private volatile boolean closed;
    public LoopbackServer(int port,String key,Handler handler)throws IOException {
        this.handler=handler;authorization=("Bearer "+key).getBytes(StandardCharsets.UTF_8);
        listener=new ServerSocket();listener.setReuseAddress(true);listener.bind(new InetSocketAddress(InetAddress.getByName("127.0.0.1"),port),8);
    }
    public int port(){return listener.getLocalPort();}
    public InetAddress address(){return listener.getInetAddress();}
    public void start(){Thread t=new Thread(()->{while(!closed)try{
        Socket s=listener.accept();s.setSoTimeout(1500);active.add(s);
        try{workers.execute(()->serve(s));}catch(RejectedExecutionException e){active.remove(s);s.close();}
    }catch(IOException e){if(!closed)close();}},"Thor loopback");t.setDaemon(true);t.start();}
    private String line(InputStream in)throws IOException {
        ByteArrayOutputStream out=new ByteArrayOutputStream();int b;
        while((b=in.read())!=-1){if(b=='\n')break;if(b!='\r')out.write(b);if(out.size()>4096)throw new IOException("Header too large");}
        if(b==-1&&out.size()==0)throw new EOFException();return new String(out.toByteArray(),StandardCharsets.US_ASCII);
    }
    private void serve(Socket s){try(s){
        InputStream in=s.getInputStream();String first=line(in);Map<String,String> headers=new HashMap<>();int bytes=first.length();
        for(;;){String h=line(in);if(h.isEmpty())break;bytes+=h.length();if(bytes>8192)throw new IOException("Headers too large");int n=h.indexOf(':');if(n<=0)throw new IOException("Invalid header");String k=h.substring(0,n).toLowerCase(Locale.ROOT);if(headers.put(k,h.substring(n+1).trim())!=null)throw new IOException("Duplicate header");}
        if(!first.equals("POST /exchange HTTP/1.1")){reply(s,new Result(405,"{}"));return;}
        if(!("127.0.0.1:"+port()).equals(headers.get("host"))){reply(s,new Result(403,"{}"));return;}
        String origin=headers.get("origin");
        if(origin!=null&&!Arrays.asList("https://pokesurvivor.com","https://www.pokesurvivor.com","null").contains(origin)
            &&!origin.startsWith("moz-extension://")&&!origin.startsWith("chrome-extension://")){reply(s,new Result(403,"{}"));return;}
        if(!MessageDigest.isEqual(authorization,headers.getOrDefault("authorization","").getBytes(StandardCharsets.UTF_8))){reply(s,new Result(401,"{}"));return;}
        int length;try{length=Integer.parseInt(headers.getOrDefault("content-length","-1"));}catch(NumberFormatException e){length=-1;}
        if(length<0||length>32768||headers.containsKey("transfer-encoding")){reply(s,new Result(413,"{}"));return;}
        if(!headers.getOrDefault("content-type","").startsWith("application/json")){reply(s,new Result(415,"{}"));return;}
        byte[] body=new byte[length];int offset=0;while(offset<length){int n=in.read(body,offset,length-offset);if(n<0)throw new EOFException();offset+=n;}
        Result result;try{result=handler.exchange(new String(body,StandardCharsets.UTF_8));}catch(Exception e){result=new Result(400,"{}");}
        reply(s,result);
    }catch(IOException ignored){}finally{active.remove(s);}}
    private void reply(Socket s,Result result)throws IOException {
        byte[] body=result.body.getBytes(StandardCharsets.UTF_8);
        String headers="HTTP/1.1 "+result.status+" Result\r\nContent-Type: application/json\r\nCache-Control: no-store\r\nConnection: close\r\nContent-Length: "+body.length+"\r\n\r\n";
        s.getOutputStream().write(headers.getBytes(StandardCharsets.US_ASCII));s.getOutputStream().write(body);s.getOutputStream().flush();
    }
    @Override public void close(){closed=true;try{listener.close();}catch(IOException ignored){}for(Socket s:active)try{s.close();}catch(IOException ignored){}workers.shutdownNow();}
}
