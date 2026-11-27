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
    private String pictureBook="",pictureChapter="";
    private ProgressDialog progress;

    @Override protected void onCreate(Bundle state) {
        super.onCreate(state);
        getWindow().setStatusBarColor(BG); getWindow().setNavigationBarColor(BG);
        try { api=new StudioApi(this); }
        catch(Exception e){ page("Storage unavailable"); paragraph("Android could not open secure storage. Restart the app and try again."); return; }
        if(state!=null){exportId=state.getString("exportId","");pictureBook=state.getString("pictureBook","");pictureChapter=state.getString("pictureChapter","");}
        if(getIntent().getData()!=null){ callback(getIntent()); return; }
        if(api.signedIn()) library(); else signIn();
    }
    @Override protected void onSaveInstanceState(Bundle out){super.onSaveInstanceState(out);out.putString("exportId",exportId);out.putString("pictureBook",pictureBook);out.putString("pictureChapter",pictureChapter);}
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
        String why=e.getMessage();new AlertDialog.Builder(this).setTitle("Couldn't finish").setMessage(why==null?"Check your connection and try again.":why).setPositiveButton("OK",null).show();
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
        ScrollView scroll=new ScrollView(this);body=new LinearLayout(this);body.setOrientation(1);body.setPadding(dp(22),dp(16),dp(22),dp(36));
        scroll.addView(body);shell.addView(scroll,new LinearLayout.LayoutParams(-1,0,1));setContentView(shell);
        body.addView(text(title,32,INK,true));gap(12);
        if ("library".equals(screen)) {
            android.widget.Toolbar actions = new android.widget.Toolbar(this);
            actions.getMenu().add("Refresh").setOnMenuItemClickListener(item -> { library(); return true; });
            actions.getMenu().add("Account").setOnMenuItemClickListener(item -> { account(); return true; });
            shell.addView(actions, new LinearLayout.LayoutParams(-1, dp(52)));
        }
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
        screen="library";page("My products");button("Creators",false,this::creators);button("Settings",false,this::settings);button("Create a draft",true,this::create);
        run("Loading your products",()->api.rows("products?select=id,title,subtitle,status,product_type&order=created_at.desc"),rows->{
            if(rows.length()==0)paragraph("Your saved drafts will appear here.");
            for(int i=0;i<rows.length();i++){JSONObject item=rows.getJSONObject(i);card(item.getString("title"),
                item.optString("product_type")+"  �  "+item.optString("status"),()->open(item.optString("id")));}
        });
    }
    private void open(String id){
        activeId=id;screen="book";page("Draft");button("Back to my products",false,this::library);
        run("Opening draft",()->new JSONObject[]{
            api.rows("products?id=eq."+id+"&select=id,title,subtitle,topic,promise,audience,tone,product_type,design,sales_kit").getJSONObject(0),
            json("items",api.rows("chapters?product_id=eq."+id+"&select=id,title,position,summary,content&order=position"))},
            result->{book=result[0];chapters=result[1].getJSONArray("items");showBook();});
    }
    private static String value(JSONObject obj,String key){return obj==null||obj.isNull(key)?"":obj.optString(key);}
    private static String cut(String text,int max){return text.length()>max?text.substring(0,max):text;}
    private void showBook() throws Exception {
        screen="book";page(book.getString("title"));String subtitle=value(book,"subtitle");if(!subtitle.isEmpty())paragraph(subtitle);
        int count=0;for(int i=0;i<chapters.length();i++)if(!value(chapters.getJSONObject(i),"content").trim().isEmpty())count++;
        paragraph(count+" of "+chapters.length()+" sections written");
        button("Design & cover",false,this::designScreen);
        button("Draft review",false,()->run("Reviewing draft",()->api.mobile("review",json("productId",activeId)),this::reviewResults));
        button("Sales kit",false,this::sales);
        if(count>0)button("Preview PDF",false,this::previewPdf);
        if(count>0 && count==chapters.length())button("Download launch kit",false,()->{
            exportId=activeId;Intent pick=new Intent(Intent.ACTION_CREATE_DOCUMENT).setType("application/zip").addCategory(Intent.CATEGORY_OPENABLE);
            pick.putExtra(Intent.EXTRA_TITLE,book.optString("title","SynthForge")+"-launch-kit.zip");startActivityForResult(pick,43);
        });
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
        if(req>=51 && req<=53 && result==RESULT_OK && data!=null && data.getData()!=null){
            Uri uri=data.getData();String id=pictureBook,cid=pictureChapter;
            run("Saving image",()->{String image=selectedImage(uri);if(req==53)api.patch("chapters?id=eq."+cid+"&product_id=eq."+id+"&select=id",json("image_url",image,"image_prompt",JSONObject.NULL));
                else{JSONObject d=api.rows("products?id=eq."+id+"&select=design").getJSONObject(0).optJSONObject("design");if(d==null)d=json();d.put("coverMode",req==51?"complete":JSONObject.NULL);api.patch("products?id=eq."+id+"&select=id",json("cover_url",image,"design",d));}return true;},x->open(id));return;
        }
        if((req!=42 && req!=43)||result!=RESULT_OK||data==null||data.getData()==null)return;
        Uri destination=data.getData();String id=exportId;
        run("Exporting your PDF",()->{byte[] bytes=req==43?api.kit(id):api.pdf(id);
            if(bytes.length<5 || (req==43 ? bytes[0]!=80 || bytes[1]!=75 : bytes[0]!=37 || bytes[1]!=80 || bytes[2]!=68 || bytes[3]!=70))throw new IOException("PDF export was unavailable.");
            try(OutputStream out=getContentResolver().openOutputStream(destination)){if(out==null)throw new IOException("Cannot write this file.");out.write(bytes);}return null;
        },x->Toast.makeText(this,req==43?"Launch kit saved":"PDF saved",Toast.LENGTH_LONG).show());
    }
    private void pickPicture(int request,String chapter){
        pictureBook=activeId;pictureChapter=chapter;Intent intent=new Intent(Intent.ACTION_OPEN_DOCUMENT).setType("image/*").addCategory(Intent.CATEGORY_OPENABLE);startActivityForResult(intent,request);
    }
    private String selectedImage(Uri uri) throws Exception {
        android.graphics.BitmapFactory.Options opts=new android.graphics.BitmapFactory.Options();opts.inJustDecodeBounds=true;
        try(InputStream in=getContentResolver().openInputStream(uri)){android.graphics.BitmapFactory.decodeStream(in,null,opts);}
        if(opts.outWidth<=0||opts.outHeight<=0)throw new IOException("Choose a supported image.");
        opts.inSampleSize=1;while(Math.max(opts.outWidth,opts.outHeight)/opts.inSampleSize>2400)opts.inSampleSize*=2;opts.inJustDecodeBounds=false;
        try(InputStream in=getContentResolver().openInputStream(uri);ByteArrayOutputStream bytes=new ByteArrayOutputStream()){
            android.graphics.Bitmap b=android.graphics.BitmapFactory.decodeStream(in,null,opts);if(b==null)throw new IOException("Cannot read this image.");
            try{b.compress(android.graphics.Bitmap.CompressFormat.JPEG,88,bytes);}finally{b.recycle();}
            return "data:image/jpeg;base64,"+android.util.Base64.encodeToString(bytes.toByteArray(),android.util.Base64.NO_WRAP);
        }
    }
    private void read(JSONObject chapter){
        screen="read";page(chapter.optString("title"));button("Edit chapter",false,()->edit(chapter));
        button("Upload chapter photo",false,()->pickPicture(53,value(chapter,"id")));
        button("Generate chapter image",false,()->run("Illustrating chapter",()->{
            JSONObject d=design(),style=d.optJSONObject("customStyle");JSONObject r=api.mobile("illustrate",json("productId",activeId,"prompt",cut(value(chapter,"title")+". "+value(chapter,"summary"),1000),"style",style==null?value(d,"theme"):value(style,"imageStyle")));
            api.patch("chapters?id=eq."+chapter.getString("id")+"&select=id",json("image_url",r.getString("dataUrl")));return true;},done->previewPdf()));
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
                TextView t=text(line.replaceFirst("^>\\s*","").replaceFirst("^[-*] "," "),17,quote?LIME:INK,false);
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
    private Spinner choose(String label,String[] options,String selected){
        body.addView(text(label,16,MUTED,true));Spinner s=new Spinner(this);s.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,options));s.setSelection(Math.max(0,java.util.Arrays.asList(options).indexOf(selected)));body.addView(s);gap(12);return s;
    }
    private void settings(){
        screen="settings";page("Settings");run("Loading settings",()->api.mobile("settings",json()),r->{
            paragraph(r.optBoolean("hasKey")?"OpenAI key connected":"Connect your OpenAI key");EditText key=input("OpenAI API key","",1);key.setSingleLine();key.setInputType(129);
            button("Save key",true,()->{String secret=key.getText().toString().trim();run("Checking key",()->api.mobile("key",json("key",secret)),x->{key.setText("");settings();});});
            if(r.optBoolean("hasKey"))button("Remove key",false,()->new AlertDialog.Builder(this).setMessage("Remove your saved key from SynthForge?").setNegativeButton("Cancel",null).setPositiveButton("Remove",(dlg,w)->run("Removing key",()->api.mobile("removeKey",json()),x->settings())).show());
        });
    }
    private void creators(){
        screen="creators";page("Creators");EditText query=input("Industry or keywords","",1);Spinner platform=choose("Platform",new String[]{"both","instagram","tiktok"},"both");
        button("Find creators",true,()->{String term=query.getText().toString().trim(),site=platform.getSelectedItem().toString();run("Searching creators",()->api.mobile("creators",json("query",term,"platform",site)),r->{
            page("Creator search");JSONArray rows=r.getJSONArray("items");if(rows.length()==0)paragraph("No matching profiles found.");
            for(int i=0;i<rows.length();i++){JSONObject c=rows.getJSONObject(i);String h=value(c,"handle").replaceFirst("^@","");paragraph(h+" � "+value(c,"platform")+" � "+c.optInt("followers")+" followers");paragraph(value(c,"fit"));
                button("Save "+h,false,()->run("Saving creator",()->api.insert("creators",json("handle",("TikTok".equalsIgnoreCase(value(c,"platform"))?"tiktok:":"")+h,"niche",term,"followers",c.optInt("followers"))),x->creators()));}
            button("Saved creators",false,this::creators);});});
        body.addView(text("Saved creators",22,INK,true));run("Loading creators",()->api.rows("creators?select=id,handle,niche,followers,content,offer,product_id&order=created_at.desc"),rows->{
            if(rows.length()==0)paragraph("No saved creators yet.");for(int i=0;i<rows.length();i++){JSONObject c=rows.getJSONObject(i);card(value(c,"handle"),value(c,"niche"),()->{page(value(c,"handle"));button("Build draft from transcripts",true,()->creatorPlan(c));paragraph(value(c,"content"));paragraph(value(c,"offer"));if(!value(c,"product_id").isEmpty())button("Open draft",true,()->open(value(c,"product_id")));button("Creators",false,this::creators);});}
        });
    }
    private void creatorPlan(JSONObject c){
        page("Creator transcripts");paragraph("Paste up to five transcripts. Each one can contain up to 24,000 characters.");
        java.util.List<EditText> inputs=new java.util.ArrayList<>();inputs.add(input("Transcript 1","",4));button("Add transcript",false,()->{if(inputs.size()<5)inputs.add(input("Transcript "+(inputs.size()+1),"",4));});
        button("Build draft",true,()->{JSONArray ts=new JSONArray();for(EditText e:inputs){String t=e.getText().toString().trim();if(t.length()>24000){e.setError("Maximum 24,000 characters");return;}if(!t.isEmpty())ts.put(t);}if(ts.length()==0){inputs.get(0).setError("Paste a transcript");return;}
            run("Building creator draft",()->{JSONObject plan=api.mobile("creatorPlan",json("handle",value(c,"handle"),"niche",value(c,"niche"),"transcripts",ts));
                JSONObject draft=api.insert("products",json("title",plan.getString("title"),"subtitle",value(plan,"subtitle"),"topic",value(c,"handle"),"audience",value(plan,"audience"),"product_type",plan.getString("productType"),"promise",value(plan,"promise"),"tone","friendly","status","outline","design",json("creatorVoice",plan.getJSONObject("profile"),"coverByline",value(c,"handle"))));
                String id=draft.getString("id");JSONArray rows=plan.getJSONArray("chapters");
                for(int i=0;i<rows.length();i++)rows.getJSONObject(i).put("position",i).put("product_id",id);
                api.insertChapters(rows);api.patch("creators?id=eq."+c.getString("id")+"&select=id",json("product_id",id));return id;
            },id->open(id));});
    }
    private JSONObject design() throws Exception {JSONObject d=book.optJSONObject("design");return d==null?json():new JSONObject(d.toString());}
    private String outlineText(){StringBuilder out=new StringBuilder();for(int i=0;i<chapters.length();i++)out.append(value(chapters.optJSONObject(i),"title")).append("\n");return cut(out.toString(),4000);}
    private void updateBook(JSONObject patch) throws Exception {api.patch("products?id=eq."+activeId+"&select=id",patch);}
    private void designScreen(){
        screen="tools";page("Design & cover");JSONObject current=book.optJSONObject("design");EditText title=input("Book title",value(book,"title"),1),sub=input("Subtitle",value(book,"subtitle"),2),author=input("Brand or author",value(current,"coverByline"),1);
        Spinner style=choose("Interior style",new String[]{"Keep current","minimal","magazine","warm","corporate","playful"},"Keep current"),layout=choose("Cover layout",new String[]{"Keep current","band","full","split"},"Keep current");
        button("Save design",true,()->{String name=title.getText().toString().trim(),subtitle=sub.getText().toString(),by=author.getText().toString(),theme=style.getSelectedItem().toString(),template=layout.getSelectedItem().toString();
            if(name.isEmpty()){title.setError("Enter a title");return;}run("Saving design",()->{JSONObject d=design();d.put("coverByline",by);if(!theme.equals("Keep current"))d.put("theme",theme);if(!template.equals("Keep current"))d.put("coverTemplate",template);updateBook(json("title",name,"subtitle",subtitle,"design",d));return true;},x->open(activeId));});
        button("Generate interior style with AI",false,()->run("Designing interior",()->{
            JSONObject d=design(),r=api.mobile("style",json("title",value(book,"title"),"subtitle",value(book,"subtitle"),"topic",value(book,"topic"),"tone",value(book,"tone"),"audience",value(book,"audience"),"contents",outlineText(),"custom",true,"baseTheme",value(d,"theme")));
            if(r.optBoolean("keepCurrentStyle"))throw new IOException("No new style was returned.");d.put("theme",r.getString("theme"));d.put("customStyle",r.getJSONObject("customStyle"));updateBook(json("design",d));return true;
        },x->open(activeId)));
        button("Upload complete cover",false,()->pickPicture(51,""));
        button("Upload artwork for template",false,()->pickPicture(52,""));
        button("Generate artwork for template",false,()->run("Creating artwork",()->{JSONObject d=design();JSONObject r=api.mobile("cover",json("productId",activeId,"title",value(book,"title"),"topic",value(book,"topic"),"style",value(d,"theme"),"mode","artwork"));d.remove("coverMode");d.put("coverLayout",r.getString("layout"));updateBook(json("design",d,"cover_url",r.getString("dataUrl")));return true;},x->open(activeId)));
        button("Generate complete cover with AI",false,()->{String by=author.getText().toString();run("Generating cover",()->{
            JSONObject d=design(),s=d.optJSONObject("customStyle");JSONObject r=api.mobile("cover",json("productId",activeId,"title",value(book,"title"),"subtitle",value(book,"subtitle"),"topic",value(book,"topic"),"audience",value(book,"audience"),"byline",by,"mode","complete","style",s==null?value(d,"theme"):value(s,"imageStyle"),"marketCountry",d.opt("marketCountry")));
            d.put("coverMode","complete");d.put("coverByline",by);updateBook(json("cover_url",r.getString("dataUrl"),"design",d));return true;
        },x->open(activeId));});
    }
    private void sales(){
        screen="tools";page("Sales kit");JSONObject kit=book.optJSONObject("sales_kit");if(kit!=null)fields(kit);
        button(kit==null?"Generate listing copy":"Regenerate listing copy",true,()->run("Writing sales kit",()->{
            JSONObject r=api.mobile("sales",json("title",value(book,"title"),"subtitle",value(book,"subtitle"),"audience",value(book,"audience"),"outline",outlineText()));updateBook(json("sales_kit",r));return r;},r->{book.put("sales_kit",r);sales();}));
    }
    private void fields(Object o){
        if(o instanceof JSONObject){JSONObject d=(JSONObject)o;java.util.Iterator<String> keys=d.keys();while(keys.hasNext()){String k=keys.next();Object v=d.opt(k);if(v==null||v==JSONObject.NULL)continue;body.addView(text(k.replaceAll("([a-z])([A-Z])","$1 $2"),17,LIME,true));fields(v);}}
        else if(o instanceof JSONArray){JSONArray a=(JSONArray)o;for(int i=0;i<a.length();i++)fields(a.opt(i));}
        else {TextView t=text(String.valueOf(o),17,INK,false);t.setTextIsSelectable(true);body.addView(t);gap(10);}
    }
    private void reviewResults(JSONObject r) throws Exception{
        screen="tools";page("Draft review");JSONArray findings=r.getJSONArray("findings");if(findings.length()==0)paragraph("No revisions suggested.");
        for(int i=0;i<findings.length();i++){JSONObject finding=findings.getJSONObject(i);fields(finding);EditText intended="consistency".equals(value(finding,"category"))?input("Wording or value to keep","",1):null;
            button("Preview fix",false,()->{String keep=intended==null?null:intended.getText().toString().trim();run("Preparing revision",()->api.mobile("previewFix",json("productId",activeId,"finding",finding,"intendedValue",keep)),fix->{
                report("Suggested revision",fix);button("Apply fix",true,()->run("Applying revision",()->api.mobile("applyFix",json("productId",activeId,"edit",fix.getJSONObject("edit"))),done->open(activeId)));});});}
        if(r.has("sourceReview")){body.addView(text("Source review",20,INK,true));fields(r.opt("sourceReview"));}
    }
    private void report(String title,JSONObject r){screen="tools";page(title);fields(r);}
    private void previewPdf(){
        File file=new File(getCacheDir(),"preview.pdf");run("Preparing preview",()->{byte[] pdf=api.pdf(activeId);try(FileOutputStream out=new FileOutputStream(file)){out.write(pdf);}return file;},f->previewPage(f,0));
    }
    private void previewPage(File f,int index) throws Exception{
        screen="tools";page("PDF preview");try(android.os.ParcelFileDescriptor fd=android.os.ParcelFileDescriptor.open(f,android.os.ParcelFileDescriptor.MODE_READ_ONLY);android.graphics.pdf.PdfRenderer renderer=new android.graphics.pdf.PdfRenderer(fd);android.graphics.pdf.PdfRenderer.Page p=renderer.openPage(index)){
            int width=Math.min(1440,getResources().getDisplayMetrics().widthPixels);android.graphics.Bitmap bitmap=android.graphics.Bitmap.createBitmap(width,width*p.getHeight()/p.getWidth(),android.graphics.Bitmap.Config.ARGB_8888);
            bitmap.eraseColor(Color.WHITE);p.render(bitmap,null,null,android.graphics.pdf.PdfRenderer.Page.RENDER_MODE_FOR_DISPLAY);ImageView sheet=new ImageView(this);sheet.setAdjustViewBounds(true);sheet.setImageBitmap(bitmap);body.addView(sheet);
            paragraph("Page "+(index+1)+" of "+renderer.getPageCount());if(index>0)button("Previous page",false,()->turn(f,index-1));if(index+1<renderer.getPageCount())button("Next page",true,()->turn(f,index+1));}
    }
    private void turn(File f,int i){try{previewPage(f,i);}catch(Exception e){problem(e);}}
    private void create(){
        screen="new";page("Create a draft");paragraph("Choose a format and enter the topic you want to teach.");
        EditText topic=input("Topic","",3);
        java.util.TreeMap<String,String> countries=new java.util.TreeMap<>();
        for(String iso:java.util.Locale.getISOCountries()) countries.put(new java.util.Locale("",iso).getDisplayCountry(),iso);
        java.util.ArrayList<String> markets=new java.util.ArrayList<>(countries.keySet()); markets.add(0,"Global market");
        Spinner market=choose("Target market",markets.toArray(new String[0]),"Global market");
        button("Find topic ideas",false,()->run("Finding ideas",()->api.mobile("topics",json("pillar","","hint",cut(topic.getText().toString(),300),"marketCountry",countries.get(market.getSelectedItem()))),r->{
            JSONArray ideas=r.getJSONArray("ideas");String[] labels=new String[ideas.length()];for(int i=0;i<labels.length;i++)labels[i]=ideas.getJSONObject(i).getString("topic");
            new AlertDialog.Builder(this).setTitle("Choose a topic").setItems(labels,(dlg,i)->topic.setText(labels[i])).show();
        }));
        String[] formats={"auto","ebook","workbook","mini-course","checklist"};
        Spinner format=new Spinner(this);format.setAdapter(new ArrayAdapter<String>(this,android.R.layout.simple_spinner_dropdown_item,formats));body.addView(format);gap(18);
        button("Generate draft with AI",true,()->{
            String subject=topic.getText().toString().trim(), type=(String)format.getSelectedItem();
            if(subject.length()<2||subject.length()>300){topic.setError("Enter a topic between 2 and 300 characters.");return;}
            String country=countries.get(market.getSelectedItem());
            run("Planning your draft",()->{
                JSONArray angles=api.mobile("angles",json("topic",subject,"audience","","marketCountry",country,"productType",type)).getJSONArray("angles");
                JSONObject a=angles.getJSONObject(0);
                JSONObject meta=json("title",cut(a.getString("title"),200),"subtitle",cut(value(a,"subtitle"),300),"topic",subject,
                    "audience",cut(value(a.optJSONObject("brief"),"buyer"),300),"productType",a.optString("productType",type),"tone","friendly","marketCountry",country,"chapters",5,"brief",a.optJSONObject("brief"));
                JSONArray outline=api.mobile("outline",meta).getJSONArray("chapters");
                if(outline.length()==0)throw new IOException("The AI returned an empty outline. Try again.");
                JSONObject p=api.insert("products",json("title",meta.getString("title"),"subtitle",meta.getString("subtitle"),"topic",subject,
                    "audience",meta.getString("audience"),"product_type",meta.getString("productType"),"tone","friendly","promise",value(a,"promise"),
                    "design",json("brief",a.optJSONObject("brief"),"marketCountry",country),"status","outline"));
                String id=p.getString("id");JSONArray batch=new JSONArray();
                for(int i=0;i<outline.length();i++){JSONObject c=outline.getJSONObject(i);batch.put(json("product_id",id,"position",i,"title",c.getString("title"),"summary",value(c,"summary")));}
                api.insertChapters(batch);
                return id;
            },id->{activeId=id;screen="book";page("Writing your draft");button("My products",false,this::library);
                run("Loading outline",()->new JSONObject[]{api.rows("products?id=eq."+id+"&select=id,title,subtitle,promise,audience,tone,product_type,design,sales_kit").getJSONObject(0),json("items",api.rows("chapters?product_id=eq."+id+"&select=id,title,summary,content&order=position"))},
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
        else if("tools".equals(screen))open(activeId); else if(!"library".equals(screen)&&!"signin".equals(screen))library();else super.onBackPressed();
    }
}
