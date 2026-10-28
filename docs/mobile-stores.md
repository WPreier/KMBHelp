# App-Stores

Diese Fassung wird nachgezogen. Zertifikate, Store-Richtlinien und die Apple- und Google-Konten der GmbH fehlen noch und stehen nicht in diesem Repository.

Die App ist `apps/mobile`. Eine Codebasis für iOS und Android. Sie spricht in Produktion nur `https://helpdesk.kmbcloud.at`. Builds laufen über EAS, nicht auf dem Helpdesk-Server. `eas.json` enthält keine Tokens, keine Team-ID und keine Schlüssel.

## Was die App zeigt

Ohne Anmeldung: Ticket erfassen mit Quelle `app` (Kategorie, Auswirkung, Betreff, Beschreibung, Datum, Name), die öffentliche Liste ohne Beschreibung, Anleitungen mit Text und die Suche.

Die Apple- und Google-Konten der GmbH kommen später. Bis dahin lässt sich die App mit `pnpm start` auf einem Gerät prüfen. Builds und Store-Einträge warten auf diese Konten.

Mit Server-Sitzung und danach Gerätefreigabe: die IT-Liste und das Dashboard. Die Gerätefreigabe ist Biometrie oder der Gerätecode über `expo-local-authentication`. Sie ersetzt LDAPS, Passkey und TOTP nicht. Die erste Einrichtung von Passkey oder TOTP bleibt im Browser. Die App speichert danach nur die Sitzungscookies `kmbhelp_session` und `kmbhelp_csrf` in der sicheren Ablage des Geräts. Das Passwort wird nicht gespeichert. Ohne beide Freigaben zeichnet die App keine Beschreibung und keinen Melder.

Bundle-Id, schon im Projekt: `at.kmbcloud.helpdesk`.

## Start auf einem Gerät

Im Ordner `apps/mobile`:

```bash
pnpm start
```

Der Start ist `index.ts` in diesem Ordner. `expo/AppEntry.js` sucht `App` relativ zum Paket. Unter pnpm liegt das Paket in `.pnpm`, und dieser relative Weg findet `App.tsx` nicht.

Die API-Adresse ist `https://helpdesk.kmbcloud.at`. Für die lokale API auf demselben Rechner setzt die Hülle `EXPO_PUBLIC_API_ORIGIN=http://127.0.0.1:3000`. Eine `http`-Adresse eines anderen Rechners lehnt der Client ab.

## Apple

Konto der GmbH, nicht eines privaten Mitarbeiters. Der Name des Kontos ist noch offen. Mit EAS Build ist kein Mac nötig. Der Developer-Account bleibt nötig.

Reihenfolge, sobald das Konto da ist: App-Id `at.kmbcloud.helpdesk` anlegen, intern über TestFlight verteilen. Ein öffentlicher Store ist für eine reine Kanzlei-App der falsche Ort. Apple Business Manager oder TestFlight reichen. Zertifikate und Profile legt EAS an, die Zugangsdaten bleiben als EAS-Secret außerhalb des Git.

Face ID: der Text steht in `app.json` unter `NSFaceIDUsageDescription`.

## Google

Play-Console-Konto der GmbH. Der Name ist noch offen. Interner Test-Track, dieselbe App-Id `at.kmbcloud.helpdesk`. Der Signierschlüssel bleibt bei Play App Signing oder als EAS-Secret, nicht im Repository.

## Was noch fehlt

- Welches Apple-Team und welches Play-Konto der GmbH gehören.
- Die dann gültigen Store-Richtlinien, Datenschutztext und Altersfreigabe.
- Ob die App nur intern oder auch öffentlich gelistet wird. Vorschlag bleibt intern.
