import { useState } from "react";
import { KeyboardAvoidingView, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { describeError } from "@/data/errors";
import { useEngine } from "@/data/session";
import { useTheme } from "@/theme";
import { Button } from "@/ui/Button";
import { Panel } from "@/ui/Panel";
import { Text } from "@/ui/Text";

/**
 * Sign in with the e-mail you were invited with: a one-time code arrives by
 * mail. Same account and passkeys as pulso.bixku.online; the passkey on the
 * phone is pending (README).
 */
export default function Entrar() {
  const { sendCode, verifyCode, configured } = useEngine();
  const { colors, space, type, hairline } = useTheme();
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const validEmail = /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email.trim());
  const ready = !busy && (sent ? code.trim().length >= 6 : validEmail);

  const submit = async () => {
    if (!ready) return;
    setBusy(true);
    setError(null);
    try {
      if (!sent) {
        await sendCode(email);
        setSent(true);
      } else await verifyCode(email, code);
    } catch (e) {
      setError(describeError(e));
    } finally {
      setBusy(false);
    }
  };

  const field = {
    ...type.body,
    fontSize: 17,
    color: colors.text,
    backgroundColor: colors.surfaceRaised,
    borderRadius: 12,
    borderWidth: hairline,
    borderColor: colors.separator,
    paddingHorizontal: space.lg,
    height: 56,
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={{ flex: 1, paddingTop: insets.top + space.xl, paddingHorizontal: space.gutter, paddingBottom: insets.bottom + space.lg, gap: space.sm }}>
        <View style={{ paddingHorizontal: 4, gap: 10, marginBottom: space.md }}>
          <Text variant="label" color="accentText">
            ◆ Pulso
          </Text>
          <Text variant="largeTitle">Entra a Pulso</Text>
          <Text variant="callout" color="textSecondary">
            {configured
              ? "Usa el correo con el que te invitaron. Te mandamos un código para entrar; es la misma cuenta que en pulso.bixku.online."
              : "Esta compilación no tiene EXPO_PUBLIC_SUPABASE_URL ni EXPO_PUBLIC_SUPABASE_ANON_KEY. Agrégalas en .env.local y vuelve a compilar."}
          </Text>
        </View>
        {configured ? (
          <Panel style={{ gap: 14 }}>
            <View style={{ gap: 8 }}>
              <Text variant="label" color="textSecondary">
                Correo
              </Text>
              <TextInput
                testID="email"
                value={email}
                onChangeText={(text) => {
                  setEmail(text);
                  if (sent) setSent(false);
                }}
                autoCapitalize="none"
                autoCorrect={false}
                keyboardType="email-address"
                textContentType="emailAddress"
                autoComplete="email"
                placeholder="tu@correo.com"
                placeholderTextColor={colors.textTertiary}
                style={field}
                onSubmitEditing={submit}
              />
            </View>
            {sent ? (
              <View style={{ gap: 8 }}>
                <Text variant="label" color="textSecondary">
                  Código del correo
                </Text>
                <TextInput
                  testID="code"
                  value={code}
                  onChangeText={(text) => setCode(text.replace(/\D/g, "").slice(0, 10))}
                  keyboardType="number-pad"
                  textContentType="oneTimeCode"
                  placeholder="123456"
                  placeholderTextColor={colors.textTertiary}
                  style={[field, type.number, { letterSpacing: 6, height: 64, textAlign: "center" }]}
                  onSubmitEditing={submit}
                  autoFocus
                />
              </View>
            ) : null}
            {error ? (
              <Text variant="footnote" color="negative">
                {error}
              </Text>
            ) : null}
          </Panel>
        ) : null}
        <View style={{ flex: 1 }} />
        {configured ? <Button testID="sign-in" title={sent ? "Entrar" : "Mandarme un código"} variant="accent" size="lg" onPress={submit} disabled={!ready} busy={busy} /> : null}
      </View>
    </KeyboardAvoidingView>
  );
}
