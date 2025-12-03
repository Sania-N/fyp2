import { GEMINI_API_KEY } from '@env';
import React, { useState } from 'react';
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
import { Ionicons } from '@expo/vector-icons';
import Header from '../components/Header';
import theme from '../styles/theme';
import { GoogleGenerativeAI } from '@google/generative-ai';



const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

export default function ChatbotScreen() {
  const [messages, setMessages] = useState([
    { id: '1', text: 'Hi! I’m your AI Safety Assistant. How can I help you today?', sender: 'bot' },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);

  const sendMessage = async () => {
    if (input.trim() === '') return;

    const userMessage = { id: Date.now().toString(), text: input, sender: 'user' };
    setMessages((prev) => [...prev, userMessage]);
    setInput('');
    setLoading(true);

    try {
      console.log('Sending message:', input);
      console.log('API Key available:', !!GEMINI_API_KEY);
      
      if (!GEMINI_API_KEY) {
        throw new Error('Gemini API Key is not configured');
      }

      const result = await model.generateContent(input);
      const response = await result.response;
      const text = response.text();

      console.log('Bot response:', text);

      const botReply = {
        id: (Date.now() + 1).toString(),
        text: text || "I'm here for you! 💜",
        sender: 'bot',
      };

      setMessages((prev) => [...prev, botReply]);
    } catch (error) {
      console.error('Gemini API Error:', error);
      console.error('Error message:', error?.message);
      console.error('Error code:', error?.code);
      
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
              <ActivityIndicator size="small" color={theme.colors.primary} />
              <Text style={styles.typingText}>AI is typing...</Text>
            </View>
          )}
        </View>

        {/* Input Area - Positioned Above Navigation */}
        <View style={styles.inputContainer}>
          <TextInput
            placeholder="Type your message..."
            style={styles.input}
            value={input}
            onChangeText={setInput}
          />
          <TouchableOpacity style={styles.sendButton} onPress={sendMessage} disabled={loading}>
            <Ionicons name="send" size={22} color="#fff" />
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  safeArea: { flex: 1, backgroundColor: '#fff' },
  container: {
    flex: 1,
    paddingHorizontal: 15,
    paddingBottom: 10,
    backgroundColor: '#fff',
  },
  title: {
    fontSize: 22,
    fontWeight: '700',
    marginVertical: 10,
    color: theme.colors.primary,
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
    backgroundColor: theme.colors.primary,
    alignSelf: 'flex-end',
    borderBottomRightRadius: 0,
  },
  botBubble: {
    backgroundColor: '#F1F1F1',
    alignSelf: 'flex-start',
    borderBottomLeftRadius: 0,
  },
  messageText: {
    color: '#000',
    fontSize: 15,
  },
  typingIndicator: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 5,
    paddingLeft: 10,
  },
  typingText: { marginLeft: 6, color: 'gray', fontStyle: 'italic' },
  inputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 25,
    marginHorizontal: 10,
    marginBottom: 70,
    marginTop: 10,
  },
  input: {
    flex: 1,
    paddingHorizontal: 10,
    paddingVertical: 6,
    fontSize: 15,
  },
  sendButton: {
    backgroundColor: theme.colors.primary,
    borderRadius: 50,
    padding: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
