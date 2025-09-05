// src/services/appwrite/messaging/NotificationTemplates.js

import { 
  NOTIFICATION_TYPES, 
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_PRIORITIES 
} from './NotificationConstants.js';

/**
 * Application-specific notification templates
 * Handles formatted notifications for specific use cases
 */
export class NotificationTemplates {
  constructor(notificationService) {
    this.notificationService = notificationService;
    this.log = notificationService.log || console.log;
    this.appwriteService = null; // Will be set if needed
  }

  /**
   * Set AppwriteService instance for user preferences
   * @param {Object} appwriteService - AppwriteService instance
   */
  setAppwriteService(appwriteService) {
    this.appwriteService = appwriteService;
  }

  /**
   * Get localized notification text based on user language
   * @param {string} userId - User ID
   * @param {string} templateKey - Template key from NOTIFICATION_TEMPLATES
   * @param {Object} replacements - Text replacements
   * @returns {Promise<Object>} - { title, body } in user's language
   */
  async getLocalizedNotification(userId, templateKey, replacements = {}) {
    try {
      // Get user's language preference
      let userLanguage = 'en'; // Default
      if (this.appwriteService) {
        userLanguage = await this.appwriteService.getUserLanguage(userId);
      }

      // Get template in user's language
      const template = this.getTemplateByLanguage(templateKey, userLanguage);
      
      // Apply replacements
      let title = template.title;
      let body = template.body;
      
      for (const [key, value] of Object.entries(replacements)) {
        const placeholder = `{${key}}`;
        title = title.replace(placeholder, value);
        body = body.replace(placeholder, value);
      }

      return { title, body, language: userLanguage };
    } catch (error) {
      this.log(`Error getting localized notification: ${error.message}`);
      // Fallback to default template
      const template = NOTIFICATION_TEMPLATES[templateKey];
      return { 
        title: template.title, 
        body: template.body,
        language: 'en'
      };
    }
  }

  /**
   * Get template by language
   * @param {string} templateKey - Template key
   * @param {string} language - Language code
   * @returns {Object} - Template in specified language
   */
getTemplateByLanguage(templateKey, language) {
  // Notification templates for different languages
  const LOCALIZED_TEMPLATES = {
    en: NOTIFICATION_TEMPLATES,
    tr: {
      MATCH: {
        title: '🎉 Yeni Eşleşme!',
        body: 'Harika! Yeni biriyle eşleştiniz!'
      },
      LIKE: {
        title: '💜 Yeni Beğeni',
        body: '{userName} sizi beğendi!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Özel Mesaj',
        body: '{senderName} size özel bir mesaj gönderdi!'
      },
      SYSTEM: {
        title: '📢 Sistem Bildirimi',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Özel Teklif',
        body: '{message}'
      }
    },
    de: {
      MATCH: {
        title: '🎉 Neues Match!',
        body: 'Großartig! Sie haben ein neues Match!'
      },
      LIKE: {
        title: '💜 Neues Like',
        body: '{userName} mag Sie!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Direktnachricht',
        body: '{senderName} hat Ihnen eine spezielle Nachricht gesendet!'
      },
      SYSTEM: {
        title: '📢 Systembenachrichtigung',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Sonderangebot',
        body: '{message}'
      }
    },
    es: {
      MATCH: {
        title: '🎉 ¡Nuevo Match!',
        body: '¡Genial! ¡Tienes un nuevo match!'
      },
      LIKE: {
        title: '💜 Nuevo Like',
        body: '¡{userName} te ha dado like!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Mensaje Directo',
        body: '¡{senderName} te ha enviado un mensaje especial!'
      },
      SYSTEM: {
        title: '📢 Notificación del Sistema',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Oferta Especial',
        body: '{message}'
      }
    },
    fr: {
      MATCH: {
        title: '🎉 Nouveau Match!',
        body: 'Génial! Vous avez un nouveau match!'
      },
      LIKE: {
        title: '💜 Nouveau Like',
        body: '{userName} vous a liké!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Message Direct',
        body: '{senderName} vous a envoyé un message spécial!'
      },
      SYSTEM: {
        title: '📢 Notification Système',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Offre Spéciale',
        body: '{message}'
      }
    },
    ar: {
      MATCH: {
        title: '🎉 مباراة جديدة!',
        body: 'رائع! لديك مباراة جديدة!'
      },
      LIKE: {
        title: '💜 إعجاب جديد',
        body: '{userName} أعجب بك!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ رسالة مباشرة',
        body: '{senderName} أرسل لك رسالة خاصة!'
      },
      SYSTEM: {
        title: '📢 إشعار النظام',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 عرض خاص',
        body: '{message}'
      }
    },
    bn: {
      MATCH: {
        title: '🎉 নতুন ম্যাচ!',
        body: 'দুর্দান্ত! আপনার একটি নতুন ম্যাচ হয়েছে!'
      },
      LIKE: {
        title: '💜 নতুন লাইক',
        body: '{userName} আপনাকে লাইক করেছে!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ সরাসরি বার্তা',
        body: '{senderName} আপনাকে একটি বিশেষ বার্তা পাঠিয়েছে!'
      },
      SYSTEM: {
        title: '📢 সিস্টেম নোটিশ',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 বিশেষ অফার',
        body: '{message}'
      }
    },
    zh: {
      MATCH: {
        title: '🎉 新配对!',
        body: '太棒了！您有新的配对！'
      },
      LIKE: {
        title: '💜 新点赞',
        body: '{userName} 点赞了您！'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ 私信',
        body: '{senderName} 给您发送了一条特殊消息！'
      },
      SYSTEM: {
        title: '📢 系统通知',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 特别优惠',
        body: '{message}'
      }
    },
    he: {
      MATCH: {
        title: '🎉 התאמה חדשה!',
        body: 'נהדר! יש לך התאמה חדשה!'
      },
      LIKE: {
        title: '💜 לייק חדש',
        body: '{userName} נתן לך לייק!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ הודעה ישירה',
        body: '{senderName} שלח לך הודעה מיוחדת!'
      },
      SYSTEM: {
        title: '📢 הודעת מערכת',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 הצעה מיוחדת',
        body: '{message}'
      }
    },
    hi: {
      MATCH: {
        title: '🎉 नया मैच!',
        body: 'बहुत बढ़िया! आपका एक नया मैच है!'
      },
      LIKE: {
        title: '💜 नई लाइक',
        body: '{userName} ने आपको लाइक किया है!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ सीधा संदेश',
        body: '{senderName} ने आपको एक विशेष संदेश भेजा है!'
      },
      SYSTEM: {
        title: '📢 सिस्टम अधिसूचना',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 विशेष ऑफर',
        body: '{message}'
      }
    },
    id: {
      MATCH: {
        title: '🎉 Match Baru!',
        body: 'Hebat! Anda mendapat match baru!'
      },
      LIKE: {
        title: '💜 Like Baru',
        body: '{userName} menyukai Anda!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Pesan Langsung',
        body: '{senderName} mengirim pesan khusus kepada Anda!'
      },
      SYSTEM: {
        title: '📢 Notifikasi Sistem',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Penawaran Khusus',
        body: '{message}'
      }
    },
    it: {
      MATCH: {
        title: '🎉 Nuovo Match!',
        body: 'Fantastico! Hai un nuovo match!'
      },
      LIKE: {
        title: '💜 Nuovo Like',
        body: '{userName} ti ha messo like!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Messaggio Diretto',
        body: '{senderName} ti ha inviato un messaggio speciale!'
      },
      SYSTEM: {
        title: '📢 Notifica di Sistema',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Offerta Speciale',
        body: '{message}'
      }
    },
    ja: {
      MATCH: {
        title: '🎉 新しいマッチ！',
        body: '素晴らしい！新しいマッチがあります！'
      },
      LIKE: {
        title: '💜 新しいいいね',
        body: '{userName}さんがあなたにいいねしました！'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ ダイレクトメッセージ',
        body: '{senderName}さんから特別なメッセージが届きました！'
      },
      SYSTEM: {
        title: '📢 システム通知',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 特別オファー',
        body: '{message}'
      }
    },
    ko: {
      MATCH: {
        title: '🎉 새로운 매치!',
        body: '멋져요! 새로운 매치가 생겼어요!'
      },
      LIKE: {
        title: '💜 새로운 좋아요',
        body: '{userName}님이 회원님을 좋아해요!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ 다이렉트 메시지',
        body: '{senderName}님이 특별한 메시지를 보냈어요!'
      },
      SYSTEM: {
        title: '📢 시스템 알림',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 특별 혜택',
        body: '{message}'
      }
    },
    fa: {
      MATCH: {
        title: '🎉 تطبیق جدید!',
        body: 'عالی! تطبیق جدیدی دارید!'
      },
      LIKE: {
        title: '💜 لایک جدید',
        body: '{userName} شما را لایک کرده!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ پیام مستقیم',
        body: '{senderName} پیام ویژه‌ای برای شما فرستاده!'
      },
      SYSTEM: {
        title: '📢 اطلاع سیستم',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 پیشنهاد ویژه',
        body: '{message}'
      }
    },
    pl: {
      MATCH: {
        title: '🎉 Nowy Match!',
        body: 'Świetnie! Masz nowy match!'
      },
      LIKE: {
        title: '💜 Nowe Polubienie',
        body: '{userName} Cię polubił!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Wiadomość Prywatna',
        body: '{senderName} wysłał Ci specjalną wiadomość!'
      },
      SYSTEM: {
        title: '📢 Powiadomienie Systemowe',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Specjalna Oferta',
        body: '{message}'
      }
    },
    pt: {
      MATCH: {
        title: '🎉 Novo Match!',
        body: 'Incrível! Você tem um novo match!'
      },
      LIKE: {
        title: '💜 Novo Curtir',
        body: '{userName} curtiu você!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Mensagem Direta',
        body: '{senderName} enviou uma mensagem especial para você!'
      },
      SYSTEM: {
        title: '📢 Notificação do Sistema',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Oferta Especial',
        body: '{message}'
      }
    },
    ru: {
      MATCH: {
        title: '🎉 Новое совпадение!',
        body: 'Отлично! У вас новое совпадение!'
      },
      LIKE: {
        title: '💜 Новый лайк',
        body: '{userName} поставил вам лайк!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Личное сообщение',
        body: '{senderName} отправил вам особое сообщение!'
      },
      SYSTEM: {
        title: '📢 Системное уведомление',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Специальное предложение',
        body: '{message}'
      }
    },
    th: {
      MATCH: {
        title: '🎉 แมทช์ใหม่!',
        body: 'เยี่ยม! คุณมีแมทช์ใหม่!'
      },
      LIKE: {
        title: '💜 ใหม่ไลค์',
        body: '{userName} ไลค์คุณ!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ ข้อความตรง',
        body: '{senderName} ส่งข้อความพิเศษให้คุณ!'
      },
      SYSTEM: {
        title: '📢 การแจ้งเตือนระบบ',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 ข้อเสนอพิเศษ',
        body: '{message}'
      }
    },
    uk: {
      MATCH: {
        title: '🎉 Новий збіг!',
        body: 'Чудово! У вас новий збіг!'
      },
      LIKE: {
        title: '💜 Новий лайк',
        body: '{userName} поставив вам лайк!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Пряме повідомлення',
        body: '{senderName} надіслав вам особливе повідомлення!'
      },
      SYSTEM: {
        title: '📢 Системне сповіщення',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Спеціальна пропозиція',
        body: '{message}'
      }
    },
    ur: {
      MATCH: {
        title: '🎉 نیا میچ!',
        body: 'بہترین! آپ کا نیا میچ ہے!'
      },
      LIKE: {
        title: '💜 نئی لائک',
        body: '{userName} نے آپ کو لائک کیا ہے!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ براہ راست پیغام',
        body: '{senderName} نے آپ کو خصوصی پیغام بھیجا ہے!'
      },
      SYSTEM: {
        title: '📢 سسٹم کی اطلاع',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 خصوصی پیشکش',
        body: '{message}'
      }
    },
    vi: {
      MATCH: {
        title: '🎉 Ghép đôi mới!',
        body: 'Tuyệt vời! Bạn có một ghép đôi mới!'
      },
      LIKE: {
        title: '💜 Thích mới',
        body: '{userName} đã thích bạn!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Tin nhắn riêng',
        body: '{senderName} đã gửi cho bạn một tin nhắn đặc biệt!'
      },
      SYSTEM: {
        title: '📢 Thông báo hệ thống',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Ưu đãi đặc biệt',
        body: '{message}'
      }
    },
    ms: {
      MATCH: {
        title: '🎉 Padanan Baru!',
        body: 'Hebat! Anda ada padanan baru!'
      },
      LIKE: {
        title: '💜 Suka Baru',
        body: '{userName} menyukai anda!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Mesej Terus',
        body: '{senderName} menghantar mesej khas kepada anda!'
      },
      SYSTEM: {
        title: '📢 Pemberitahuan Sistem',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Tawaran Istimewa',
        body: '{message}'
      }
    },
    sw: {
      MATCH: {
        title: '🎉 Mechi Mpya!',
        body: 'Bora! Una mechi mpya!'
      },
      LIKE: {
        title: '💜 Kupenda Mpya',
        body: '{userName} amekupenda!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Ujumbe Moja kwa Moja',
        body: '{senderName} amekutumia ujumbe maalum!'
      },
      SYSTEM: {
        title: '📢 Arifa ya Mfumo',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Ofa Maalum',
        body: '{message}'
      }
    },
    nl: {
      MATCH: {
        title: '🎉 Nieuwe Match!',
        body: 'Geweldig! Je hebt een nieuwe match!'
      },
      LIKE: {
        title: '💜 Nieuwe Like',
        body: '{userName} vindt je leuk!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Direct Bericht',
        body: '{senderName} heeft je een speciaal bericht gestuurd!'
      },
      SYSTEM: {
        title: '📢 Systeemmelding',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Speciale Aanbieding',
        body: '{message}'
      }
    },
    sv: {
      MATCH: {
        title: '🎉 Ny Match!',
        body: 'Fantastiskt! Du har en ny match!'
      },
      LIKE: {
        title: '💜 Ny Gilla',
        body: '{userName} gillar dig!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Direktmeddelande',
        body: '{senderName} har skickat dig ett speciellt meddelande!'
      },
      SYSTEM: {
        title: '📢 Systemmeddelande',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Specialerbjudande',
        body: '{message}'
      }
    },
    no: {
      MATCH: {
        title: '🎉 Ny Match!',
        body: 'Flott! Du har en ny match!'
      },
      LIKE: {
        title: '💜 Ny Like',
        body: '{userName} liker deg!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Direktemelding',
        body: '{senderName} har sendt deg en spesiell melding!'
      },
      SYSTEM: {
        title: '📢 Systemvarsel',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Spesialtilbud',
        body: '{message}'
      }
    },
    da: {
      MATCH: {
        title: '🎉 Nyt Match!',
        body: 'Fantastisk! Du har et nyt match!'
      },
      LIKE: {
        title: '💜 Nyt Like',
        body: '{userName} kan lide dig!'
      },
      MESSAGE: {
        title: '💬 {senderName}',
        body: '{messagePreview}'
      },
      DIRECT_MESSAGE: {
        title: '✉️ Direkte Besked',
        body: '{senderName} har sendt dig en særlig besked!'
      },
      SYSTEM: {
        title: '📢 Systembesked',
        body: '{message}'
      },
      PROMOTION: {
        title: '🎁 Særligt Tilbud',
        body: '{message}'
      }
    }
  };

  // Get templates for language or fallback to English
  const templates = LOCALIZED_TEMPLATES[language] || LOCALIZED_TEMPLATES.en;
  return templates[templateKey] || NOTIFICATION_TEMPLATES[templateKey];
}

  /**
   * Send notification for match event
   * @param {string} userId1 - First user ID
   * @param {string} userId2 - Second user ID
   * @param {Object} matchData - Match information
   * @returns {Promise<Object>} - Notification results
   */
  async sendMatchNotification(userId1, userId2, matchData) {
    // Get localized notifications for both users
    const [user1Notification, user2Notification] = await Promise.all([
      this.getLocalizedNotification(userId1, 'MATCH', { 
        partnerName: matchData.user2Name 
      }),
      this.getLocalizedNotification(userId2, 'MATCH', { 
        partnerName: matchData.user1Name 
      })
    ]);

    const baseData = {
      type: NOTIFICATION_TYPES.MATCH,
      matchId: matchData.matchId,
      timestamp: new Date().toISOString()
    };

    // Send to both users with localized content
    const notifications = [
      {
        title: user1Notification.title,
        body: user1Notification.body,
        userIds: [userId1],
        data: { ...baseData, partnerId: userId2, partnerName: matchData.user2Name },
        options: { priority: NOTIFICATION_PRIORITIES.HIGH }
      },
      {
        title: user2Notification.title,
        body: user2Notification.body,
        userIds: [userId2],
        data: { ...baseData, partnerId: userId1, partnerName: matchData.user1Name },
        options: { priority: NOTIFICATION_PRIORITIES.HIGH }
      }
    ];

    const results = await this.notificationService.sendBatch(notifications);
    
    this.log(`Match notifications sent: ${results.successful.length}/2 successful`);
    
    return results;
  }

  /**
   * Send notification for new like
   * @param {string} likerId - User who liked
   * @param {string} likedId - User who was liked
   * @param {string} likerName - Name of liker
   * @param {Object} additionalData - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  async sendLikeNotification(likerId, likedId, likerName, additionalData = {}) {
    // Get localized notification
    const localizedNotification = await this.getLocalizedNotification(
      likedId, 
      'LIKE', 
      { userName: likerName }
    );

    const data = {
      type: NOTIFICATION_TYPES.LIKE,
      likerId,
      likerName,
      timestamp: new Date().toISOString(),
      ...additionalData
    };

    const result = await this.notificationService.sendToUsers(
      localizedNotification.title,
      localizedNotification.body,
      [likedId],
      data,
      { priority: NOTIFICATION_PRIORITIES.NORMAL }
    );

    this.log(`Like notification sent to user ${likedId} in ${localizedNotification.language}`);
    
    return result;
  }

  /**
   * Send notification for direct message (special privilege message without match/like)
   * @param {string} senderId - Message sender ID
   * @param {string} receiverId - Message receiver ID
   * @param {string} senderName - Sender name
   * @param {string} messagePreview - Message preview text
   * @param {Object} directMessageData - Direct message details
   * @returns {Promise<Object>} - Notification result
   */
  async sendDirectMessageNotification(senderId, receiverId, senderName, messagePreview, directMessageData = {}) {
    // Get localized notification
    const localizedNotification = await this.getLocalizedNotification(
      receiverId,
      'DIRECT_MESSAGE',
      { senderName }
    );

    // Direct message has special data to indicate it's a privileged message
    const data = {
      type: NOTIFICATION_TYPES.DIRECT_MESSAGE,
      senderId,
      senderName,
      conversationId: directMessageData.conversationId || 
        `direct_${[senderId, receiverId].sort().join('_')}`,
      messageId: directMessageData.messageId,
      isDirectMessage: true,  // Flag to indicate this is a special direct message
      remainingDirectMessages: directMessageData.remainingCount, // How many direct messages user has left
      timestamp: new Date().toISOString()
    };

    const result = await this.notificationService.sendToUsers(
      localizedNotification.title,
      localizedNotification.body,
      [receiverId],
      data,
      { 
        priority: NOTIFICATION_PRIORITIES.HIGH,
        sound: 'special',  // Different sound for direct messages
        badge: directMessageData.unreadCount || 1,
        color: '#FFD700',  // Gold color to indicate special message,
        action :''
      }
    );

    this.log(`Direct message notification sent to user ${receiverId} in ${localizedNotification.language}`);
    
    return result;
  }

  /**
   * Send notification for new message
   * @param {string} senderId - Message sender ID
   * @param {string} receiverId - Message receiver ID
   * @param {string} senderName - Sender name
   * @param {string} messagePreview - Message preview text
   * @param {Object} conversationData - Conversation details
   * @returns {Promise<Object>} - Notification result
   */
  async sendMessageNotification(senderId, receiverId, senderName, messagePreview, conversationData = {}) {
    // Truncate message preview if too long
    const truncatedPreview = messagePreview.length > 100 ? 
      messagePreview.substring(0, 97) + '...' : 
      messagePreview;

    // Get localized notification
    const localizedNotification = await this.getLocalizedNotification(
      receiverId,
      'MESSAGE',
      { 
        senderName,
        messagePreview: truncatedPreview
      }
    );

    const data = {
      type: NOTIFICATION_TYPES.MESSAGE,
      senderId,
      senderName,
      conversationId: conversationData.conversationId || 
        `${[senderId, receiverId].sort().join('_')}`,
      messageId: conversationData.messageId,
      timestamp: new Date().toISOString()
    };

    const result = await this.notificationService.sendToUsers(
      localizedNotification.title,
      localizedNotification.body,
      [receiverId],
      data,
      { 
        priority: NOTIFICATION_PRIORITIES.HIGH,
        sound: 'message',
        badge: conversationData.unreadCount || 1
      }
    );

    this.log(`Message notification sent to user ${receiverId} in ${localizedNotification.language}`);
    
    return result;
  }

  /**
   * Send system notification
   * @param {Array<string>} userIds - Target users
   * @param {string} message - System message
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  async sendSystemNotification(userIds, message, data = {}) {
    // For system notifications, we can either localize per user
    // or send the same message to all (depends on requirements)
    const template = NOTIFICATION_TEMPLATES.SYSTEM;
    const title = template.title;
    const body = template.body.replace('{message}', message);

    const notificationData = {
      type: NOTIFICATION_TYPES.SYSTEM,
      timestamp: new Date().toISOString(),
      ...data
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      userIds,
      notificationData,
      { priority: NOTIFICATION_PRIORITIES.LOW }
    );

    this.log(`System notification sent to ${userIds.length} users`);
    
    return result;
  }

  /**
   * Send promotion notification
   * @param {Array<string>} userIds - Target users
   * @param {string} message - Promotion message
   * @param {Object} data - Additional data
   * @returns {Promise<Object>} - Notification result
   */
  async sendPromotionNotification(userIds, message, data = {}) {
    const template = NOTIFICATION_TEMPLATES.PROMOTION;
    const title = template.title;
    const body = template.body.replace('{message}', message);

    const notificationData = {
      type: NOTIFICATION_TYPES.PROMOTION,
      timestamp: new Date().toISOString(),
      ...data
    };

    const result = await this.notificationService.sendToUsers(
      title,
      body,
      userIds,
      notificationData,
      { 
        priority: NOTIFICATION_PRIORITIES.LOW,
        ttl: 86400 // Expire after 24 hours
      }
    );

    this.log(`Promotion notification sent to ${userIds.length} users`);
    
    return result;
  }
}