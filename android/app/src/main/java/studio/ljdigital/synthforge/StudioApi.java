package studio.ljdigital.synthforge;

import android.content.Context;
import android.content.SharedPreferences;
import android.net.Uri;
import android.security.keystore.KeyGenParameterSpec;
import android.security.keystore.KeyProperties;
import android.util.Base64;
import org.json.JSONArray;
import org.json.JSONObject;
import java.io.*;
import java.net.*;
import java.nio.charset.StandardCharsets;
import java.security.*;
import javax.crypto.*;
import javax.crypto.spec.GCMParameterSpec;

final class StudioApi {
    private static final String DB = "https://elmaacxzqjxrxqyfywzx.supabase.co";
    private static final String KEY = "sb_publishable_lv-f3N2Ru7FlvVmTuBRCSw_2f2Uim0t";
    private static final String MOBILE = "https://synthforgeai.netlify.app/api/mobile";
    private static final String ALIAS = "synthforge.session.v2";
    private final SharedPreferences prefs;
    private final SecretKey secret;

    StudioApi(Context context) throws Exception {
        prefs = context.getSharedPreferences("studio", Context.MODE_PRIVATE);
        KeyStore keys = KeyStore.getInstance("AndroidKeyStore");
        keys.load(null);
        if (!keys.containsAlias(ALIAS)) {
            KeyGenerator gen = KeyGenerator.getInstance("AES", "AndroidKeyStore");
            gen.init(new KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT | KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM).setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE).build());
            gen.generateKey();
        }
        secret = (SecretKey) keys.getKey(ALIAS, null);
    }
    static JSONObject json(Object... pairs) throws Exception {
        JSONObject value = new JSONObject();
        for (int i=0; i<pairs.length; i+=2) value.put((String)pairs[i], pairs[i+1]);
        return value;
    }
    private String encode(byte[] bytes) { return Base64.encodeToString(bytes, Base64.URL_SAFE|Base64.NO_WRAP|Base64.NO_PADDING); }
    private String nonce() { byte[] bytes = new byte[32]; new SecureRandom().nextBytes(bytes); return encode(bytes); }
    private void store(String key, JSONObject value) throws Exception {
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.ENCRYPT_MODE, secret);
        String encrypted = encode(c.getIV()) + "." + encode(c.doFinal(value.toString().getBytes(StandardCharsets.UTF_8)));
        if (!prefs.edit().putString(key, encrypted).commit()) throw new IOException("Could not save sign-in on this phone.");
    }
    private JSONObject load(String key) throws Exception {
        String existing = prefs.getString(key, "");
        if (existing.isEmpty()) return new JSONObject();
        String[] parts = existing.split("\\.");
        Cipher c = Cipher.getInstance("AES/GCM/NoPadding");
        c.init(Cipher.DECRYPT_MODE, secret, new GCMParameterSpec(128, Base64.decode(parts[0], Base64.URL_SAFE)));
        return new JSONObject(new String(c.doFinal(Base64.decode(parts[1], Base64.URL_SAFE)), StandardCharsets.UTF_8));
    }
    boolean signedIn() { return prefs.contains("session"); }
    Uri login() throws Exception {
        String verifier = nonce(), state = nonce();
        store("pending", json("state", state, "verifier", verifier, "time", System.currentTimeMillis()));
        String challenge = encode(MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.US_ASCII)));
        return Uri.parse(MOBILE).buildUpon().appendQueryParameter("challenge", challenge).appendQueryParameter("state", state).build();
    }
    void finishLogin(Uri uri) throws Exception {
        JSONObject pending = load("pending");
        String code = uri.getQueryParameter("code");
        if (!"studio.ljdigital.synthforge".equals(uri.getScheme()) || !"login".equals(uri.getHost()) || !"/callback".equals(uri.getPath())
            || code == null || !code.matches("[A-Za-z0-9_-]{8,256}") || !pending.has("state")
            || !pending.getString("state").equals(uri.getQueryParameter("state")) || System.currentTimeMillis()-pending.getLong("time") > 600000)
            throw new IOException("This sign-in expired. Start Google sign-in again.");
        sessionGrant("pkce", json("auth_code", code, "code_verifier", pending.getString("verifier")));
        prefs.edit().remove("pending").commit();
    }
    private void sessionGrant(String grant, JSONObject input) throws Exception {
        JSONObject result = new JSONObject(string(request(DB+"/auth/v1/token?grant_type="+grant, "POST", input, "", null)));
        store("session", json("access", result.getString("access_token"), "refresh", result.getString("refresh_token"),
            "until", System.currentTimeMillis()+result.getLong("expires_in")*1000));
    }
    void logout() throws Exception {
        try { if (signedIn()) request(DB+"/auth/v1/logout?scope=local", "POST", null, load("session").getString("access"), null); }
        finally { prefs.edit().clear().commit(); }
    }
    private String token(boolean force) throws Exception {
        JSONObject session = load("session");
        if (!session.has("refresh")) throw new IOException("Sign in to continue.");
        if (force || session.getLong("until") < System.currentTimeMillis()+60000) {
            try { sessionGrant("refresh_token", json("refresh_token",session.getString("refresh"))); }
            catch (HttpError e) {
                if (e.status == 400 || e.status == 401) prefs.edit().remove("session").commit();
                throw e;
            }
            session = load("session");
        }
        return session.getString("access");
    }
    private byte[] authorized(String url, String method, Object body, String prefer) throws Exception {
        try { return request(url,method,body,token(false),prefer); }
        catch (HttpError e) {
            if (e.status != 401 || !signedIn()) throw e;
            return request(url,method,body,token(true),prefer);
        }
    }
    private static String string(byte[] data) { return new String(data,StandardCharsets.UTF_8); }
    private static final class HttpError extends IOException {
        final int status;
        HttpError(int status,String message) { super(message); this.status=status; }
    }
    private byte[] request(String url, String method, Object body, String bearer, String prefer) throws Exception {
        HttpURLConnection conn = (HttpURLConnection)new URL(url).openConnection();
        try {
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(18000); conn.setReadTimeout(120000);
            conn.setRequestMethod(method);
            if(url.startsWith(DB+"/")) conn.setRequestProperty("apikey",KEY);
            if(!bearer.isEmpty()) conn.setRequestProperty("Authorization","Bearer "+bearer);
            if(prefer!=null) conn.setRequestProperty("Prefer",prefer);
            if(body!=null) {
                conn.setDoOutput(true); conn.setRequestProperty("Content-Type","application/json");
                try(OutputStream out=conn.getOutputStream()){out.write(body.toString().getBytes(StandardCharsets.UTF_8));}
            }
            int status=conn.getResponseCode();
            ByteArrayOutputStream buffer=new ByteArrayOutputStream();
            try(InputStream stream=status>=400?conn.getErrorStream():conn.getInputStream()) {
                if(stream!=null){byte[] chunk=new byte[8192];int n;while((n=stream.read(chunk))!=-1)buffer.write(chunk,0,n);}
            }
            byte[] bytes=buffer.toByteArray();
            if(status<200 || status>=300) {
                String message="Request failed ("+status+").";
                try { JSONObject error=new JSONObject(string(bytes)); message=error.optString("message",error.optString("error_description",error.optString("error",message))); } catch(Exception ignored) {}
                throw new HttpError(status,message);
            }
            return bytes;
        } finally {conn.disconnect();}
    }
    JSONArray rows(String path) throws Exception {return new JSONArray(string(authorized(DB+"/rest/v1/"+path,"GET",null,null)));}
    void patch(String path,JSONObject edit) throws Exception {
        JSONArray updated = new JSONArray(string(authorized(DB+"/rest/v1/"+path,"PATCH",edit,"return=representation")));
        if(updated.length()!=1) throw new IOException("The chapter changed. Reopen it before saving.");
    }
    JSONObject mobile(String action,JSONObject data) throws Exception {
        return new JSONObject(string(authorized(MOBILE,"POST",json("action",action,"data",data),null)));
    }
    byte[] pdf(String id) throws Exception {return authorized(MOBILE,"POST",json("action","pdf","data",json("id",id)),null);}
    JSONObject insert(String table,JSONObject row) throws Exception {
        return new JSONArray(string(authorized(DB+"/rest/v1/"+table,"POST",row,"return=representation"))).getJSONObject(0);
    }
    void insertChapters(JSONArray rows) throws Exception {
        // PostgREST accepts arrays for a single transactional bulk insert.
        authorized(DB+"/rest/v1/chapters","POST",rows,"return=minimal");
    }
    void removeEmptyDraft(String id) throws Exception {authorized(DB+"/rest/v1/products?id=eq."+id,"DELETE",null,null);}
}
