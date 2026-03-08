import { GEMINI_API_KEY } from '@env';
import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  StyleSheet,
  KeyboardAvoidingView,
  Platform,
  SafeAreaView,
  ActivityIndicator,
} from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import { GoogleGenerativeAI } from '@google/generative-ai';
import AsyncStorage from '@react-native-async-storage/async-storage';

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

/* ===================== SYSTEM PROMPT ===================== */

const SYSTEM_PROMPT = `
You are SAFE — a smart AI safety companion focused on women's safety and emotional wellbeing.

Your tone must always be:
- Calm
- Supportive
- Non-judgmental
- Clear and direct
- Not overly robotic

-------------------------
GENERAL BEHAVIOR
-------------------------

- Keep responses short but meaningful.
- Always prioritize user safety.
- If the user message is unclear, ask a gentle clarifying question.
- Never invent fake emergency numbers.
- Never use placeholders like "(police emergency number)".

-------------------------
EMPTY OR INVALID INPUT
-------------------------

If the user sends:
- An empty message ("")
- Only spaces
- Only numbers (e.g., "123")
- Only symbols (e.g., "?", "!!!", "--")

Respond with:
"I’m here for you. Can you tell me how you're feeling or if you are safe right now?"

-------------------------
RISK LEVEL CLASSIFICATION
-------------------------

Before responding, classify the user's message into one of three levels:

LEVEL 1 – Emotional Distress (No Immediate Danger)
Examples:
- "I feel anxious"
- "My heart is racing"
- Crying emoji
- "I am scared"
- "I wish I could disappear"
- Random unclear distress

Response:
- Use calming tone
- Provide grounding or breathing suggestion
- Ask gentle follow-up
- DO NOT provide police or emergency numbers yet

Example style:
"I’m here with you. Let’s take a slow breath together. Are you somewhere safe right now?"

--------------------------------------------------

LEVEL 2 – Safety Concern (Unclear or Potential Risk)
Examples:
- "It’s dark and I’m alone"
- "Someone might be watching me"
- "I feel uncomfortable"
- "Help me please"

Response:
- Provide safety tips first
- Suggest moving to public/well-lit area
- Suggest sharing live location
- Ask: "Are you in immediate danger right now?"

Only provide emergency numbers IF user confirms danger.

--------------------------------------------------

LEVEL 3 – Immediate Danger or Self-Harm
Examples:
- "I am in danger"
- "Someone is attacking me"
- "I want to hurt myself"
- "I don't want to live"

Response immediately with:

"Your safety is the most important thing right now.

If you are in immediate danger, call:
• Police: 15
• Rescue/Ambulance: 1122
• Umang Mental Health: 0317-4288665

Please call one of these now.

Are you able to call right now?"

-------------------------
SELF-HARM / SUICIDAL THOUGHTS
-------------------------

If the user expresses:
- "I want to hurt myself"
- "I don't want to live"
- Any suicidal thoughts

Respond with empathy:

"I’m really sorry you're feeling this way. You are not alone, and help is available right now.

Please contact:
• Umang Mental Health Helpline: 0317-4288665
• Police: 15
• Emergency/Rescue: 1122

If you are in immediate danger, please call one of these numbers now.

Can you reach out to someone you trust or call one of these services right now?"

Do not sound clinical. Be warm and human.

-------------------------
CHECK-IN RESPONSES
-------------------------

If user selects:

"Yes, I am safe"
→ Respond warmly:
"I’m relieved to hear that. If anything changes or you start feeling unsafe, tell me immediately. I'm here to help."

"I feel uncomfortable"
→ Respond with:
"I understand. Try to move to a more public or well-lit area if possible. Keep your phone ready and consider sharing your location with someone you trust. Would you like more safety tips?"

"I need help"
→ Respond urgently:
"Okay. If you are in danger right now, call:
• Police: 15
• Rescue: 1122

You can also call Umang Helpline: 0317-4288665

Tell me where you are, and I’ll guide you."

-------------------------
LANGUAGE SUPPORT
-------------------------

If user writes in Urdu, respond in Urdu.
If in English, respond in English.

-------------------------
END RULE
-------------------------

Your purpose is to guide, support, and protect. 
Always prioritize immediate safety over conversation.
`;

export default function ChatbotScreen() {
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hi! I’m your AI Safety Assistant. How can I help you today?', sender: 'bot' },
  ]);
  const [hydrated, setHydrated] = useState(false);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { id: Date.now().toString(), text: input, sender: 'user' };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      if (!GEMINI_API_KEY) {
        throw new Error('Gemini API Key is not configured');
      }

      // Build conversation history (last 6 messages)
      const conversationHistory = messages
        .slice(-6)
        .map(msg => `${msg.sender === 'user' ? 'User' : 'Assistant'}: ${msg.text}`)
        .join('\n');

      const fullPrompt = `
${SYSTEM_PROMPT}

Conversation so far:
${conversationHistory}

User: ${input}

Assistant:
`;

      const result = await model.generateContent(fullPrompt);
      const response = await result.response;
      const text = response.text();

      const botReply = {
        id: (Date.now() + 1).toString(),
        text: text || "I'm here for you. 💜",
        sender: 'bot',
      };

      setMessages((prev) => [...prev, botReply]);
    } catch (error) {
      console.error('Gemini API Error:', error);

      let friendlyMessage = "I'm having trouble responding right now. Please try again.";

      if (error?.message?.includes('API key')) {
        friendlyMessage = "API configuration error. Please check your settings.";
      } else if (error?.message?.includes('quota')) {
        friendlyMessage = "API quota exceeded. Please try again later.";
      } else if (error?.message?.includes('network')) {
        friendlyMessage = "Network error. Please check your connection.";
      }

      const errorReply = {
        id: (Date.now() + 2).toString(),
        text: friendlyMessage,
        sender: 'bot',
      };

      setMessages((prev) => [...prev, errorReply]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const loadMessages = async () => {
      try {
        const raw = await AsyncStorage.getItem('@chat_messages');
        if (raw) {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length > 0) {
            setMessages(parsed);
          }
        }
      } catch (e) {
        console.warn('Failed to load chat messages:', e);
      } finally {
        setHydrated(true);
      }
    };

    loadMessages();
  }, []);

  useEffect(() => {
    if (!hydrated) return;

    const save = async () => {
      try {
        await AsyncStorage.setItem('@chat_messages', JSON.stringify(messages));
      } catch (e) {
        console.warn('Failed to save chat messages:', e);
      }
    };

    save();
  }, [messages, hydrated]);

  const renderItem = ({ item }) => (
    <View
      style={[
        styles.messageBubble,
        item.sender === 'user' ? styles.userBubble : styles.botBubble,
      ]}
    >
      <Text
        style={[
          styles.messageText,
          item.sender === 'user' && { color: '#fff' },
        ]}
      >
        {item.text}
      </Text>
    </View>
  );

  return (
    <LinearGradient 
      colors={['#2d1b2e', '#3d0d3d', '#1a3d4f']} 
      style={{ flex: 1 }}
    >
      <SafeAreaView style={styles.safeArea}>
        <Header />
        <KeyboardAvoidingView
          style={styles.flex}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={styles.container}>
            <Text style={styles.title}>AI Chat Assistant</Text>

            <FlatList
              data={messages}
              keyExtractor={(item) => item.id}
              renderItem={renderItem}
              contentContainerStyle={styles.chatContainer}
            />

            {loading && (
              <View style={styles.typingIndicator}>
                <ActivityIndicator size="small" color="#fff" />
                <Text style={styles.typingText}>AI is typing...</Text>
              </View>
            )}
          </View>

          <View style={styles.inputContainer}>
            <TextInput
              placeholder="Type your message..."
              style={styles.input}
              value={input}
              onChangeText={setInput}
              placeholderTextColor="rgba(255, 255, 255, 0.5)"
              multiline
            />
            <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={loading}>
              <Ionicons name="send" size={22} color="rgba(255, 200, 220, 1)" />
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: 'transparent' },
  container: {
    flex: 1,
    paddingHorizontal: 15,
    paddingBottom: 10,
    backgroundColor: 'transparent',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginVertical: 10,
    color: '#fff',
  },
  chatContainer: {
    flexGrow: 1,
    justifyContent: 'flex-end',
    paddingBottom: 20,
  },
  messageBubble: {
    maxWidth: '80%',
    padding: 10,
    borderRadius: 15,
    marginVertical: 6,
  },
  userBubble: {
    backgroundColor: 'rgba(128, 0, 32, 0.8)',
    alignSelf: 'flex-end',
    borderBottomRightRadius: 0,
  },
  botBubble: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 0,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
  },
  messageText: {
    color: '#fff',
    fontSize: 15,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    paddingLeft: 10,
  },
  typingText: { marginLeft: 6, color: 'rgba(255, 255, 255, 0.7)', fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(77, 20, 60, 0.4)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 10,
    marginBottom: 70,
    marginTop: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
    color: '#fff',
  },
  sendButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    borderRadius: 50,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 200, 220, 0.4)',
  },
});