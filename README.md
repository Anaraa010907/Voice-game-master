# MAFIA: SHADOWS

A landscape-first online Mafia card game for real players. Rooms, lobbies and the full game run on a Supabase Edge Function (`game`) with Supabase Realtime; voice runs on LiveKit.

## Local development

```sh
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and fill in only the public browser configuration. All `.env*` files are ignored by Git except `.env.example`.

```dotenv
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-supabase-publishable-or-anon-key
VITE_LIVEKIT_TOKEN_URL=https://your-project-ref.supabase.co/functions/v1/livekit-voice
VITE_AUTH_REDIRECT_URL=
```

`VITE_SUPABASE_ANON_KEY` accepts either a legacy anon key or the newer Supabase publishable key with the installed Supabase JS v2 client. These are public browser credentials; never use a Supabase secret/service-role key or LiveKit signing secret in a `VITE_` variable.

## Supabase setup

1. In Authentication > Providers > Email, enable email/password and keep email confirmation enabled. Configure a production SMTP sender for reliable verification and recovery mail. The existing optional phone UI also needs an enabled phone provider and SMS service; it is not required for email accounts.
2. In Authentication > URL Configuration, set the deployed web origin as the Site URL and allow the exact signup/recovery redirect URLs. By default the app redirects to `window.location.origin` and `/?password-reset=1`. If `VITE_AUTH_REDIRECT_URL` is set, allow that exact URL instead. For Android, allow `mafia-shadows://auth/callback`.
3. Add the project URL and public anon/publishable key to Codespaces `.env.local` (or `.env`). Leave `VITE_AUTH_REDIRECT_URL` empty for web; set it to `mafia-shadows://auth/callback` only for Android builds.
4. This workspace is not linked to a Supabase project and the Supabase CLI is not installed. After confirming the intended project, install/use the CLI and inspect migration state before applying anything:

   ```sh
   npx supabase login
   npx supabase link --project-ref <confirmed-project-ref>
   npx supabase migration list
   npx supabase db push --dry-run
   ```

Never run `db push` until the project ref and SQL review are confirmed. On a clean project, migrations apply by timestamp: `20261016_auth_profiles_ranks.sql`, `20261017_voice_rooms.sql` (for voice), then `20261018_public_profile_security.sql`. Run all pending migrations before exposing the app. If a migration is already recorded as applied, apply only pending migrations; do not edit migration history or force a rerun.

### Migration review

- `20261016_auth_profiles_ranks.sql` is required for Auth profiles and rankings. It creates profile, match, and rating tables; Auth triggers; and the match processor. **It exposes every profile column to anon and authenticated users until the new forward migration is applied.** Its match processor is service-role-only, but completion/validity flags are not independent proof of a valid result. This project has no trusted match-validation backend.
- `20261017_voice_rooms.sql` is required by the voice function. It additively creates the room/member tables and grants access only to `service_role`; it does not provision rooms or membership.
- `20261018_public_profile_security.sql` is a forward security repair. It revokes broad profile/table privileges, gives users read access to their own full profile, exposes only the intended leaderboard columns via a view, keeps profile updates limited to `display_name` and `avatar_key`, and backfills Auth users that predate the profile trigger.

The migrations do not drop tables or reset data. `CREATE TABLE IF NOT EXISTS` does not verify an existing table's shape, so compare the target schema first. Apply the first and third migrations together before app launch to avoid leaving the broad profile-read policy active.

## LiveKit voice setup

The client requests a short-lived token from `supabase/functions/livekit-voice`. The function validates the Supabase access token, checks membership from server-side data, and only then issues a 10-minute room-scoped LiveKit token. It enforces phase/alive/mute permissions and host mute authorization. The browser asks for microphone access only after the user presses the microphone button. Leaving voice does not remove game-room membership.

1. Create a LiveKit project and use its secure `wss://` server URL.
2. In Supabase Dashboard > Edge Functions > Secrets, configure `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, and `ROOM_CONTROLLER_SECRET`. Supabase supplies `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to Edge Functions. Never enter LiveKit secrets, the room controller secret, or the service-role key into frontend configuration.

   Also configure `ALLOWED_ORIGINS` as a comma-separated exact-origin allow-list (the deployed web origin and, for Android, `capacitor://localhost`). Browser requests are rejected unless their Origin is listed. This is configuration, not a secret.
3. After the target project is confirmed and the migrations and required secrets are approved, deploy explicitly:

   ```sh
   npx supabase link --project-ref <confirmed-project-ref>
   npx supabase db push
   npx supabase functions deploy livekit-voice
   ```

4. Set `VITE_LIVEKIT_TOKEN_URL=https://<project-ref>.supabase.co/functions/v1/livekit-voice` in `.env.local`. Keep server credentials out of Vite variables.

The lobby/room creation/game state in this repository are local simulations. **There is no trusted multiplayer backend** to create `voice_rooms` and `voice_room_members`, validate actual players, synchronize authoritative phases, or validate competitive match results. The Edge Function correctly rejects a user without a server-created membership; a room code or local host badge is not authorization. Do not call its `sync` action from the browser or expose `ROOM_CONTROLLER_SECRET`. Real multiplayer voice is not operational until a trusted game controller is implemented and deployed.

After that controller exists, test audio on two separate devices with two signed-in users provisioned into the same room: join from both, press the microphone control after granting permission, and verify each hears the other during an allowed phase. Also test leave, denied microphone permission, reconnect, and host mute. A local build, two-tab test, or token response alone does not prove real audio.

## Online multiplayer

There are no simulated players. Every seat is a signed-in person.

- `supabase/migrations/20261021_multiplayer_rooms.sql` adds `game_rooms`, `game_room_players`, `game_states` (server-only: every role and the room password hash), `game_public` (what the whole table sees) and `game_private` (one row per player with only their own role and results). RLS lets players read only rooms they sit in and only their own private row; all writes go through the function.
- `supabase/functions/game` is the authoritative server: `create`, `join`, `leave`, `ready`, `start`, `night`, `vote`, `tick` and `rematch`. It runs the shared rules engine in `supabase/functions/_shared/gameEngine.ts` (the browser imports the same file), uses optimistic locking so simultaneous actions never overwrite each other, and keeps `voice_rooms`/`voice_room_members` in step so LiveKit mutes the right people each phase.
- Phases move on when everyone who must act has acted, or when the phase timer runs out (any phone nudges the server with `tick`; the server re-checks the deadline). The host can skip waiting phases.
- At least 4 players are needed; everyone except the host must press Ready.

Deploy from a Codespace terminal:

```sh
npx supabase login
npx supabase link --project-ref <project-ref>
npx supabase db push
npx supabase functions deploy game
```

## Game rules

- **Night:** the Mafia picks one victim (simulated Mafia members agree on the same target). The Doctor protects one player and may protect themselves, but never the same player two nights in a row. The Detective learns whether a player is Mafia-aligned, and every result stays in their private notebook for the rest of the game.
- **Old Lady with Shotgun:** the first unprotected Mafia attack on her is answered by her shotgun, which eliminates the attacker. The shotgun fires only once; a later attack kills her.
- **Bad Informant:** works for the Mafia without the Mafia knowing who they are. If every Mafia member is eliminated, the Bad Informant takes over the night attack.
- **Morning:** night victims are announced without their role. Up to two living town players leave traces, which are clues, not proof.
- **Voting:** the single player with the most votes is eliminated and their true role is revealed to everyone. If Skip leads or ties, nobody is eliminated. If two or more players tie, one runoff vote is held between only those players; a second tie eliminates nobody.
- **Winning:** citizens win when no Mafia-aligned player is alive. The Mafia wins when Mafia-aligned players equal or outnumber everyone else.
- **Timeouts:** a Mafia that never chooses attacks nobody; a missing vote counts as Skip. A player who leaves mid-game is eliminated without their role being revealed.

## Full-screen play

The game fills the whole screen at any aspect ratio (no 16:9 letterbox) and keeps content clear of notches with CSS safe-area insets. On phone browsers the first tap enters fullscreen and locks landscape where the browser allows it; a **БҮТЭН ДЭЛГЭЦ** button on the main menu and in the in-game settings toggles it. Adding the site to the home screen opens it fullscreen through `public/manifest.webmanifest`. The Android app hides the status and navigation bars (immersive mode) and draws into the camera cutout.

## Android debug APK

The app uses Capacitor 8 around the existing Vite build; debug builds use Android's automatically generated debug signature. Install JDK 21 and Android SDK Platform 36/Build Tools 36, configure `JAVA_HOME` and `ANDROID_HOME` (or `ANDROID_SDK_ROOT`), and accept the Android SDK licenses. Android Studio can install/manage these components. The `android:apk` script selects the JDK 21 bundled in this Codespaces image when the default Java is incompatible; elsewhere, set `ANDROID_JDK_HOME` to a JDK 21 installation.

For an APK with Supabase email links returning to the app, set `VITE_AUTH_REDIRECT_URL=mafia-shadows://auth/callback` in the build environment and allow that URL in Supabase Auth redirect settings. Keep this setting empty for normal web builds.

```sh
npm ci
npm run android:apk
```

The command rebuilds the web app, syncs Capacitor, and runs Gradle `assembleDebug`. The expected APK is:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

In Codespaces, download that file from the Explorer (or use Android Studio/`adb install -r android/app/build/outputs/apk/debug/app-debug.apk` on a computer connected to the phone). Enable installing apps from that source if Android prompts. The Android manifest declares Internet and microphone/audio settings permissions; the Capacitor WebView requests microphone permission only when voice capture is started. HTTPS/WSS is required; cleartext traffic is not enabled.

## Checks

```sh
npm run build
npm run test:engine
node --experimental-strip-types src/i18n.test.ts
node --experimental-strip-types src/voicePolicy.test.ts
npm run test:voice-request
npm audit
```

`npm test` runs the local engine, i18n, voice-policy, and request-validation tests. Authentication, deployed RLS behavior, room authorization, and two-device audio require a configured external project and have not been integration-tested.