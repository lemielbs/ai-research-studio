package studio.ljdigital.synthforge;

import android.app.*;
import android.os.Bundle;
import android.content.Intent;
import android.graphics.Color;
import android.graphics.Typeface;
import android.graphics.drawable.GradientDrawable;
import android.net.Uri;
import android.view.*;
import android.widget.*;
import org.json.*;
import java.io.*;
import java.util.concurrent.Executors;
import java.util.concurrent.ExecutorService;

import static studio.ljdigital.synthforge.StudioApi.json;

public final class MainActivity extends Activity {
    private static final int INK=0xfff5f4e9, MUTED=0xffb0b4a9, BG=0xff111410, PANEL=0xff20251e, LIME=0xffc6f466;
    private final ExecutorService network=Executors.newSingleThreadExecutor();
    private StudioApi api;
    private LinearLayout body;
    private String screen="signin", activeId="", original="", exportId="";
    private JSONObject book;
    private JSONArray chapters;
    private EditText editor;
    private boolean busy;
    private ProgressDialog progress;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG); getWindow().setNavigationBarColor(BG);
        try { api=new StudioApi(this); }
        catch(Exception e){ page("Storage unavailable"); paragraph("Android could not open secure storage. Restart the app and try again."); return; }
        if(state!=null) exportId=state.getString("exportId","");
        if(getIntent().getData()!=null){ callback(getIntent()); return; }
        if(api.signedIn()) library(); else signIn();
    }
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putString("exportId",exportId);}
    @Override protected void onNewIntent(Intent intent){super.onNewIntent(intent); if(intent.getData()!=null) callback(intent);}
    @Override protected void onDestroy(){ if(progress!=null)progress.dismiss(); network.shutdown();super.onDestroy(); }
    private void callback(Intent i){
        Uri uri=i.getData(); setIntent(new Intent()); signIn();
        run("Finishing sign-in",()->{api.finishLogin(uri);return null;},unused->library());
    }
    private interface Job<T> {T execute() throws Exception;}
    private interface Done<T> {void accept(T value) throws Exception;}
    private <T> void run(String message,Job<T> task,Done<T> success){
        if(busy)return;
        busy=true; progress=ProgressDialog.show(this,"SynthForge",message,true,false);
        network.execute(()->{
            try {T value=task.execute();runOnUiThread(()->{if(isDestroyed())return;end();try{success.accept(value);}catch(Exception e){problem(e);}});}
            catch(Exception e){runOnUiThread(()->{if(!isDestroyed()){end();problem(e);}});}
        });
    }
    private void end(){busy=false;if(progress!=null){progress.dismiss();progress=null;}}
    private void problem(Exception e){
        if(!api.signedIn() && !"signin".equals(screen)) signIn();
        String why=e.getMessage();new AlertDialog.Builder(this).setTitle("Couldn’t finish").setMessage(why==null?"Check your connection and try again.":why).setPositiveButton("OK",null).show();
    }
    private void progress(String s){runOnUiThread(()->{if(progress!=null && !isDestroyed())progress.setMessage(s);});}
    private int dp(int n){return (int)(n*getResources().getDisplayMetrics().density+0.5f);}
    private GradientDrawable shape(int color,int radius){GradientDrawable d=new GradientDrawable(); d.setColor(color);d.setCornerRadius(dp(radius));return d;}
    private void gap(int n){View v=new View(this);body.addView(v,new LinearLayout.LayoutParams(1,dp(n)));}
    private TextView text(String value,int size,int color,boolean bold){
        TextView t=new TextView(this);t.setText(value);t.setTextSize(size);t.setTextColor(color);
        if(bold)t.setTypeface(Typeface.create("sans-serif-medium",Typeface.NORMAL));return t;
    }
    private void page(String title){
        LinearLayout shell=new LinearLayout(this);shell.setOrientation(1);shell.setFitsSystemWindows(true);shell.setBackgroundColor(BG);
        LinearLayout bar=new LinearLayout(this);bar.setGravity(Gravity.CENTER_VERTICAL);bar.setPadding(dp(20),dp(14),dp(20),dp(14));
        TextView mark=text("S",22,BG,true);mark.setGravity(Gravity.CENTER);mark.setBackground(shape(LIME,11));
        bar.addView(mark,new LinearLayout.LayoutParams(dp(36),dp(36)));
        TextView brand=text("  SynthForge",20,INK,true);bar.addView(brand,new LinearLayout.LayoutParams(0,-2,1));
        if(api!=null && api.signedIn() && !"signin".equals(screen)){
            TextView account=text("Account",15,LIME,true);account.setPadding(dp(10),dp(12),0,dp(12));account.setOnClickListener(v->account());bar.addView(account);
        }
        shell.addView(bar);ScrollView scroll=new ScrollView(this);body=new LinearLayout(this);body.setOrientation(1);body.setPadding(dp(22),dp(16),dp(22),dp(36));
        scroll.addView(body);shell.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(shell);
        body.addView(text(title,32,INK,true));gap(12);
    }
    private void paragraph(String s){TextView v=text(s,16,MUTED,false);v.setLineSpacing(dp(2),1);body.addView(v);gap(12);}
    private void button(String label,boolean primary,Runnable click){
        Button b=new Button(this);b.setAllCaps(false);b.setText(label);b.setTextSize(16);b.setTextColor(primary?BG:INK);
        b.setBackground(shape(primary?LIME:PANEL,14));b.setOnClickListener(v->click.run());body.addView(b,new LinearLayout.LayoutParams(-1,dp(50)));gap(10);
    }
    private void card(String title,String info,Runnable click){
        LinearLayout card=new LinearLayout(this);card.setOrientation(1);card.setPadding(dp(16),dp(14),dp(16),dp(14));card.setBackground(shape(PANEL,16));
        card.addView(text(title,20,INK,true));card.addView(text(info,14,MUTED,false));card.setOnClickListener(v->click.run());body.addView(card);gap(10);
    }
    private EditText input(String hint,String value,int lines){
        EditText e=new EditText(this);e.setTextSize(17);e.setTextColor(INK);e.setHintTextColor(MUTED);e.setBackground(shape(PANEL,12));
        e.setPadding(dp(14),dp(12),dp(14),dp(12));e.setGravity(Gravity.TOP);e.setHint(hint);e.setText(value);e.setMinLines(lines);
        body.addView(e);gap(12);return e;
    }
    private void signIn(){
        screen="signin";page("Your publishing studio");paragraph("Sign in to create a draft and work on your saved books.");
        button("Continue with Google",true,()->{try{startActivity(new Intent(Intent.ACTION_VIEW,api.login()));}catch(Exception e){problem(e);}});
    }
    private void account(){
        new AlertDialog.Builder(this).setTitle("SynthForge account").setMessage("Sign out on this phone?")
        .setNegativeButton("Cancel",null).setPositiveButton("Sign out",(dialog,which)->run("Signing out",()->{api.logout();return null;},x->signIn())).show();
    }
    private void library(){
        screen="library";page("My products");button("Create a draft",true,this::create);button("Refresh library",false,this::library);
        run("Loading your products",()->api.rows("products?select=id,title,subtitle,status,product_type&order=created_at.desc"),rows->{
            if(rows.length()==0)paragraph("Your saved drafts will appear here.");
            for(int i=0;i<rows.length();i++){JSONObject item=rows.getJSONObject(i);card(item.getString("title"),
                item.optString("product_type")+"  ·  "+item.optString("status"),()->open(item.optString("id")));}
        });
    }
    private void open(String id){
        activeId=id;screen="book";page("Draft");button("Back to my products",false,this::library);
        run("Opening draft",()->new JSONObject[]{
            api.rows("products?id=eq."+id+"&select=id,title,subtitle,topic,promise,audience,tone,product_type,design").getJSONObject(0),
            json("items",api.rows("chapters?product_id=eq."+id+"&select=id,title,position,summary,content&order=position"))},
            result->{book=result[0];chapters=result[1].getJSONArray("items");showBook();});
    }
    private static String value(JSONObject obj,String key){return obj==null||obj.isNull(key)?"":obj.optString(key);}
    private static String cut(String text,int max){return text.length()>max?text.substring(0,max):text;}
    private void showBook() throws Exception {
        screen="book";page(book.getString("title"));String subtitle=value(book,"subtitle");if(!subtitle.isEmpty())paragraph(subtitle);
        int count=0;for(int i=0;i<chapters.length();i++)if(!value(chapters.getJSONObject(i),"content").trim().isEmpty())count++;
        paragraph(count+" of "+chapters.length()+" sections written");
        if(count<chapters.length())button("Write remaining with AI",true,this::writeRemaining);
        if(count>0)button("Save PDF to phone",count==chapters.length(),()->{
            exportId=activeId;Intent pick=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/pdf").addCategory(Intent.CATEGORY_OPENABLE);
            pick.putExtra(Intent.EXTRA_TITLE,book.optString("title","SynthForge")+".pdf");startActivityForResult(pick,42);
        });
        for(int i=0;i<chapters.length();i++){JSONObject c=chapters.getJSONObject(i);
            card((i+1)+". "+c.getString("title"),value(c,"content").isEmpty()?"Outline":"Read and edit",()->read(c));}
        button("My products",false,this::library);
    }
    @Override protected void onActivityResult(int req,int result,Intent data){
        super.onActivityResult(req,result,data);
        if(req!=42||result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri destination=data.getData();String id=exportId;
        run("Exporting your PDF",()->{byte[] bytes=api.pdf(id);
            if(bytes.length<5||bytes[0]!='%'||bytes[1]!='P'||bytes[2]!='D'||bytes[3]!='F')throw new IOException("PDF export was unavailable.");
            try(OutputStream out=getContentResolver().openOutputStream(destination)){if(out==null)throw new IOException("Cannot write this file.");out.write(bytes);}return null;
        },x->Toast.makeText(this,"PDF saved",Toast.LENGTH_LONG).show());
    }
    private void read(JSONObject chapter){
        screen="read";page(chapter.optString("title"));button("Edit chapter",false,()->edit(chapter));
        String manuscript=value(chapter,"content");
        if(manuscript.isEmpty()){paragraph(value(chapter,"summary"));return;}
        String[] blocks=manuscript.split("\n");
        for(int i=0;i<blocks.length;i++){
            String line=blocks[i].trim().replace("**","");
            if(line.isEmpty()) continue;
            if(line.startsWith("|") && i+1<blocks.length && blocks[i+1].matches("[|: \\-]+")){
                HorizontalScrollView pan=new HorizontalScrollView(this);TableLayout table=new TableLayout(this);
                int row=0;
                while(i<blocks.length && blocks[i].trim().startsWith("|")){
                    String item=blocks[i++].trim();
                    if(item.matches("[|: \\-]+"))continue;
                    TableRow cells=new TableRow(this);
                    String trimmed=item.substring(1,item.endsWith("|")?item.length()-1:item.length());
                    for(String cell:trimmed.split("\\|",-1)){
                        TextView t=text(cell.trim().replace("**",""),15,row==0?LIME:INK,row==0);
                        t.setPadding(dp(10),dp(8),dp(10),dp(8));t.setMaxWidth(dp(230));cells.addView(t);
                    }
                    if(row++%2==0)cells.setBackgroundColor(PANEL);table.addView(cells);
                }
                i--;pan.addView(table);body.addView(pan);gap(16);continue;
            }
            if(line.matches("^#{1,6}\\s+.*")){gap(8);body.addView(text(line.replaceFirst("^#+\\s+",""),22,INK,true));gap(8);}
            else {
                boolean quote=line.startsWith(">");
                TextView t=text(line.replaceFirst("^>\\s*","").replaceFirst("^[-*] ","• "),17,quote?LIME:INK,false);
                t.setLineSpacing(dp(3),1);t.setTextIsSelectable(true);body.addView(t);gap(8);
            }
        }
    }
    private void edit(JSONObject chapter){
        screen="edit";page(chapter.optString("title"));original=value(chapter,"content");editor=input("Chapter text",original,10);
        button("Save chapter",true,()->{
            String next=editor.getText().toString();
            run("Saving chapter",()->{saveChapter(chapter,original,next);return null;},x->{chapter.put("content",next);showBook();});
        });
    }
    private void saveChapter(JSONObject c,String before,String next) throws Exception {
        api.patch("chapters?id=eq."+c.getString("id")+"&content=eq."+Uri.encode(before)+"&select=id",json("content",next));
    }
    private void create(){
        screen="new";page("Create a draft");paragraph("Choose a format and enter the topic you want to teach.");
        EditText topic=input("Topic","",3);
        String[] formats={"auto","ebook","workbook","mini-course","checklist"};
        Spinner format=new Spinner(this);format.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,formats));body.addView(format);gap(18);
        button("Generate draft with AI",true,()->{
            String subject=topic.getText().toString().trim(), type=(String)format.getSelectedItem();
            if(subject.length()<2||subject.length()>300){topic.setError("Enter a topic between 2 and 300 characters.");return;}
            run("Planning your draft",()->{
                JSONArray angles=api.mobile("angles",json("topic",subject,"audience","","productType",type)).getJSONArray("angles");
                JSONObject a=angles.getJSONObject(0);
                JSONObject meta=json("title",cut(a.getString("title"),200),"subtitle",cut(value(a,"subtitle"),300),"topic",subject,
                    "audience",cut(value(a.optJSONObject("brief"),"buyer"),300),"productType",a.optString("productType",type),"tone","friendly","chapters",5,"brief",a.optJSONObject("brief"));
                JSONArray outline=api.mobile("outline",meta).getJSONArray("chapters");
                if(outline.length()==0)throw new IOException("The AI returned an empty outline. Try again.");
                JSONObject p=api.insert("products",json("title",meta.getString("title"),"subtitle",meta.getString("subtitle"),"topic",subject,
                    "audience",meta.getString("audience"),"product_type",meta.getString("productType"),"tone","friendly","promise",value(a,"promise"),
                    "design",json("brief",a.optJSONObject("brief")),"status","outline"));
                String id=p.getString("id");JSONArray batch=new JSONArray();
                for(int i=0;i<outline.length();i++){JSONObject c=outline.getJSONObject(i);batch.put(json("product_id",id,"position",i,"title",c.getString("title"),"summary",value(c,"summary")));}
                api.insertChapters(batch);
                return id;
            },id->{activeId=id;screen="book";page("Writing your draft");button("My products",false,this::library);
                run("Loading outline",()->new JSONObject[]{api.rows("products?id=eq."+id+"&select=id,title,subtitle,promise,audience,tone,product_type,design").getJSONObject(0),json("items",api.rows("chapters?product_id=eq."+id+"&select=id,title,summary,content&order=position"))},
                    loaded->{book=loaded[0];chapters=loaded[1].getJSONArray("items");showBook();writeRemaining();});});
        });
    }
    private void writeRemaining(){
        run("Writing your draft",()->{
            StringBuilder outline=new StringBuilder();
            for(int i=0;i<chapters.length();i++){JSONObject c=chapters.getJSONObject(i);outline.append(i+1).append(". ").append(value(c,"title")).append(" - ").append(value(c,"summary")).append("\n");}
            JSONObject d=book.optJSONObject("design");
            for(int i=0;i<chapters.length();i++){
                JSONObject c=chapters.getJSONObject(i);String before=value(c,"content");if(!before.trim().isEmpty())continue;
                progress("Writing section "+(i+1)+" of "+chapters.length());
                JSONObject response=api.mobile("write",json("productTitle",value(book,"title"),"subtitle",cut(value(book,"subtitle"),300),
                    "promise",cut(value(book,"promise"),500),"audience",cut(value(book,"audience"),300),"tone",value(book,"tone"),"productType",value(book,"product_type"),
                    "chapterTitle",value(c,"title"),"isFinalChapter",i==chapters.length()-1,"summary",cut(value(c,"summary"),1000),"outline",cut(outline.toString(),4000),
                    "brief",d==null?null:d.optJSONObject("brief"),"marketCountry",d==null?null:d.optString("marketCountry",null),
                    "creatorVoice",d==null?null:d.optJSONObject("creatorVoice"),"research",d==null?null:d.optJSONObject("research")));
                String next=response.getString("content");saveChapter(c,before,next);c.put("content",next);
            }
            api.patch("products?id=eq."+activeId+"&select=id",json("status","written"));return null;
        },x->showBook());
    }
    @Override public void onBackPressed(){
        if(busy)return;
        if("edit".equals(screen)){
            Runnable leave=()->{try{showBook();}catch(Exception e){problem(e);}};
            if(!editor.getText().toString().equals(original))new AlertDialog.Builder(this).setMessage("Discard your unsaved changes?").setNegativeButton("Keep editing",null).setPositiveButton("Discard",(d,w)->leave.run()).show();
            else leave.run();
        }else if("read".equals(screen)){try{showBook();}catch(Exception e){problem(e);}}
        else if("new".equals(screen)||"book".equals(screen))library();else super.onBackPressed();
    }
}
