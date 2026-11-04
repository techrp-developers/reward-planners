// Branded explanation shown once, before the real Android permission dialog.
// It is clearly the app's own sheet (logo, app colours, "Not now"); it never
// imitates the system dialog, and the system dialog always follows "Enable".
// Copy to: src/modules/common/notifications/NotificationPermissionSheet.tsx
import React from "react";
import { Image, Modal, Pressable, StyleSheet, Text, useColorScheme, View } from "react-native";
import MaterialCommunityIcons from "react-native-vector-icons/MaterialCommunityIcons";
import { NOTIFICATION_ACCENT_COLOR } from "./pushConfig";

const logo = require("../../../assets/homepage/RewardPlannersLogo.png");

type Props = {
  visible: boolean;
  onEnable: () => void;
  onNotNow: () => void;
};

export default function NotificationPermissionSheet({ visible, onEnable, onNotNow }: Props) {
  const dark = useColorScheme() === "dark";
  const colors = dark
    ? { sheet: "#1E1B2E", title: "#FFFFFF", body: "#C9C5DA", halo: "#2E2748", secondary: "#C9C5DA" }
    : { sheet: "#FFFFFF", title: "#1F1A33", body: "#5B5670", halo: "#F1EDFF", secondary: "#5B5670" };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onNotNow} statusBarTranslucent>
      <View style={styles.backdrop}>
        <View style={[styles.sheet, { backgroundColor: colors.sheet }]} accessibilityViewIsModal>
          <Image source={logo} style={styles.logo} resizeMode="contain" accessibilityIgnoresInvertColors />
          <View style={[styles.halo, { backgroundColor: colors.halo }]}>
            <MaterialCommunityIcons name="bell-ring-outline" size={40} color={NOTIFICATION_ACCENT_COLOR} />
          </View>
          <Text style={[styles.title, { color: colors.title }]} accessibilityRole="header">
            Stay Updated with Reward Planners!
          </Text>
          <Text style={[styles.body, { color: colors.body }]}>
            Get timely updates about your rewards, orders, bookings and important messages.
          </Text>
          <Text style={[styles.note, { color: colors.body }]}>
            Offers and promotions stay off unless you turn them on in Notification settings.
          </Text>
          <Pressable
            accessibilityRole="button"
            onPress={onEnable}
            style={({ pressed }) => [styles.primary, { backgroundColor: NOTIFICATION_ACCENT_COLOR, opacity: pressed ? 0.85 : 1 }]}
          >
            <Text style={styles.primaryText}>Enable Notifications</Text>
          </Pressable>
          <Pressable accessibilityRole="button" onPress={onNotNow} style={styles.secondary} hitSlop={8}>
            <Text style={[styles.secondaryText, { color: colors.secondary }]}>Not Now</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, justifyContent: "flex-end", backgroundColor: "rgba(15, 10, 30, 0.45)" },
  sheet: { borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 24, paddingTop: 20, paddingBottom: 28, alignItems: "center" },
  logo: { width: 140, height: 36, marginBottom: 16 },
  halo: { width: 84, height: 84, borderRadius: 42, alignItems: "center", justifyContent: "center", marginBottom: 16 },
  title: { fontSize: 20, fontWeight: "700", textAlign: "center", marginBottom: 8 },
  body: { fontSize: 15, lineHeight: 22, textAlign: "center", marginBottom: 6 },
  note: { fontSize: 12, lineHeight: 18, textAlign: "center", marginBottom: 20, opacity: 0.85 },
  primary: { alignSelf: "stretch", borderRadius: 14, paddingVertical: 14, alignItems: "center" },
  primaryText: { color: "#FFFFFF", fontSize: 16, fontWeight: "700" },
  secondary: { marginTop: 12, paddingVertical: 8, paddingHorizontal: 16 },
  secondaryText: { fontSize: 15, fontWeight: "600" },
});
