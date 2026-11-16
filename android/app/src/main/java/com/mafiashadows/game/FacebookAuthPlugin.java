package com.mafiashadows.game;

import com.facebook.AccessToken;
import com.facebook.CallbackManager;
import com.facebook.FacebookCallback;
import com.facebook.FacebookException;
import com.facebook.FacebookSdk;
import com.facebook.login.LoginBehavior;
import com.facebook.login.LoginManager;
import com.facebook.login.LoginResult;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.util.Arrays;

/**
 * Facebook sign-in through the Facebook app installed on the phone (a Custom Tab when it is
 * missing). Resolves with the Facebook access token, or { cancelled: true }; the web layer sends
 * the token to the facebook-login Edge Function, which turns it into a game session.
 */
@CapacitorPlugin(name = "FacebookAuth")
public class FacebookAuthPlugin extends Plugin {
    private CallbackManager callbackManager;
    private PluginCall pending;

    @Override
    public void load() {
        callbackManager = CallbackManager.Factory.create();
        LoginManager.getInstance().registerCallback(callbackManager, new FacebookCallback<LoginResult>() {
            @Override
            public void onSuccess(LoginResult result) {
                PluginCall call = take();
                if (call == null) return;
                AccessToken token = result.getAccessToken();
                JSObject payload = new JSObject();
                payload.put("accessToken", token.getToken());
                payload.put("userId", token.getUserId());
                call.resolve(payload);
            }

            @Override
            public void onCancel() {
                PluginCall call = take();
                if (call == null) return;
                JSObject payload = new JSObject();
                payload.put("cancelled", true);
                call.resolve(payload);
            }

            @Override
            public void onError(FacebookException error) {
                PluginCall call = take();
                if (call != null) call.reject(messageOf(error));
            }
        });
    }

    @PluginMethod
    public void login(PluginCall call) {
        if (!configured()) {
            call.reject("Facebook client token is not configured", "not-configured");
            return;
        }
        if (pending != null) {
            call.reject("Facebook sign-in is already open", "busy");
            return;
        }
        pending = call;
        getActivity().runOnUiThread(() -> {
            try {
                LoginManager manager = LoginManager.getInstance();
                manager.setLoginBehavior(LoginBehavior.NATIVE_WITH_FALLBACK);
                manager.logIn(getActivity(), callbackManager, Arrays.asList("public_profile", "email"));
            } catch (Exception error) {
                PluginCall waiting = take();
                if (waiting != null) waiting.reject(messageOf(error));
            }
        });
    }

    @PluginMethod
    public void logout(PluginCall call) {
        getActivity().runOnUiThread(() -> {
            try {
                LoginManager.getInstance().logOut();
            } catch (Exception ignored) {
                // Nothing to forget.
            }
            call.resolve();
        });
    }

    private boolean configured() {
        try {
            String clientToken = FacebookSdk.getClientToken();
            return clientToken != null && !clientToken.trim().isEmpty();
        } catch (Exception error) {
            return false;
        }
    }

    private synchronized PluginCall take() {
        PluginCall call = pending;
        pending = null;
        return call;
    }

    private static String messageOf(Exception error) {
        String message = error.getMessage();
        return message == null || message.isEmpty() ? "Facebook sign-in failed" : message;
    }
}
