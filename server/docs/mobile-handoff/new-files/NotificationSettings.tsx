import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Switch, Text, TouchableOpacity, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useNavigation } from "@react-navigation/native";
import { useAppTheme } from "../../../theme/ThemeContext";
import OrderHeading from "../../ecommerce/constants/heading/OrderHeading";
import {
  getNotificationPreferences,
  updateNotificationPreferences,
  type NotificationLanguage,
  type NotificationPreferences,
} from "./notificationPreferencesAPI";

const LANGUAGES: { value: NotificationLanguage; label: string }[] = [
  { value: "en", label: "English" },
  { value: "hi", label: "हिंदी" },
  { value: "mr", label: "मराठी" },
];
const QUIET_START = "22:00";
const QUIET_END = "07:00";

/**
 * Push notification preferences. Promotional switches start OFF until the
 * employee turns them on: no saved choice is never treated as consent.
 * Order, payment, account and reminder notifications are always delivered.
 */
export default function NotificationSettings() {
  const navigation = useNavigation<any>();
  const { isDark } = useAppTheme();
  const [prefs, setPrefs] = useState<NotificationPreferences | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setError("");
    getNotificationPreferences()
      .then(setPrefs)
      .catch(() => setError("Could not load your notification settings."));
  }, []);
  useEffect(load, [load]);

  const save = async (update: Partial<Omit<NotificationPreferences, "stored">>) => {
    if (!prefs || saving) return;
    const previous = prefs;
    setPrefs({ ...prefs, ...update });
    setSaving(true);
    try {
      setPrefs(await updateNotificationPreferences(update));
    } catch {
      setPrefs(previous);
      Alert.alert("Not saved", "Please check your connection and try again.");
    } finally {
      setSaving(false);
    }
  };

  const text = { color: isDark ? "#F3F4F6" : "#111827" };
  const muted = { color: isDark ? "#9CA3AF" : "#6B7280" };
  const card = { backgroundColor: isDark ? "#1F2937" : "#FFFFFF" };
  const quietOn = Boolean(prefs?.quiet_hours_start && prefs?.quiet_hours_end);

  return (
    <SafeAreaView style={[styles.safe, isDark ? styles.safeDark : styles.safeLight]}>
      <OrderHeading title="Notification settings" onBackPress={() => navigation.goBack()} showHelp={false} isDark={isDark} />
      {!prefs ? (
        <View style={styles.centered}>
          {error ? (
            <TouchableOpacity onPress={load}><Text style={[styles.link]}>{error} Tap to retry.</Text></TouchableOpacity>
          ) : <ActivityIndicator size="large" color="#6D5AE6" />}
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content}>
          <View style={[styles.card, card]}>
            <Text style={[styles.heading, text]}>Notification language</Text>
            <Text style={[styles.hint, muted]}>Notifications arrive in this language when a translation is available, otherwise in English.</Text>
            <View style={styles.languageRow}>
              {LANGUAGES.map((language) => {
                const selected = prefs.language === language.value;
                return (
                  <TouchableOpacity
                    key={language.value}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    style={[styles.languageButton, selected && styles.languageSelected]}
                    onPress={() => save({ language: language.value })}
                  >
                    <Text style={[styles.languageText, selected ? styles.languageTextSelected : text]}>{language.label}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>

          <View style={[styles.card, card]}>
            <Row label="Offers and promotions" hint="Deals, cart reminders and product updates." value={prefs.marketing_enabled}
              onChange={(value) => save({ marketing_enabled: value })} textStyle={text} mutedStyle={muted} />
            <Row label="Activity and engagement" hint="RP Move nudges, quizzes and colleague birthdays." value={prefs.engagement_enabled}
              onChange={(value) => save({ engagement_enabled: value })} textStyle={text} mutedStyle={muted} />
            <Row label={`Quiet hours (${QUIET_START}–${QUIET_END})`} hint="Hold promotional notifications overnight." value={quietOn}
              onChange={(value) => save(value ? { quiet_hours_start: QUIET_START, quiet_hours_end: QUIET_END } : { quiet_hours_start: null, quiet_hours_end: null })}
              textStyle={text} mutedStyle={muted} />
          </View>

          <Text style={[styles.footnote, muted]}>Order, payment, account and reminder notifications are always sent.</Text>
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

function Row({ label, hint, value, onChange, textStyle, mutedStyle }: {
  label: string; hint: string; value: boolean; onChange: (value: boolean) => void;
  textStyle: object; mutedStyle: object;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowText}>
        <Text style={[styles.rowLabel, textStyle]}>{label}</Text>
        <Text style={[styles.hint, mutedStyle]}>{hint}</Text>
      </View>
      <Switch value={value} onValueChange={onChange} trackColor={{ true: "#852BAF" }} accessibilityLabel={label} />
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1 },
  safeDark: { backgroundColor: "#111827" },
  safeLight: { backgroundColor: "#F5F3FF" },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", padding: 24 },
  content: { padding: 16, gap: 16 },
  card: { borderRadius: 16, padding: 16 },
  heading: { fontSize: 16, fontWeight: "700" },
  hint: { fontSize: 12, marginTop: 4 },
  languageRow: { flexDirection: "row", gap: 8, marginTop: 12 },
  languageButton: { flex: 1, borderRadius: 12, borderWidth: 1, borderColor: "#D1D5DB", paddingVertical: 10, alignItems: "center" },
  languageSelected: { backgroundColor: "#852BAF", borderColor: "#852BAF" },
  languageText: { fontSize: 14, fontWeight: "600" },
  languageTextSelected: { color: "#FFFFFF" },
  row: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  rowText: { flex: 1 },
  rowLabel: { fontSize: 15, fontWeight: "600" },
  footnote: { fontSize: 12, textAlign: "center" },
  link: { color: "#6D5AE6", fontWeight: "600", textAlign: "center" },
});
