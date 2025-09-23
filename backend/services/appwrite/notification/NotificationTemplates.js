import {
  NOTIFICATION_TYPES,
  NOTIFICATION_TEMPLATES,
  NOTIFICATION_PRIORITIES
} from './NotificationConstants.js';


export class NotificationTemplates {
  constructor(notificationService) {
    this.notificationService = notificationService;
    this.log = notificationService.log || console.log;
    this.appwriteService = null;
  }

  setAppwriteService(appwriteService) {
    this.appwriteService = appwriteService;
  }

  getTemplateByLanguage(templateKey, language) {
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

    const templates = LOCALIZED_TEMPLATES[language] || LOCALIZED_TEMPLATES.en;
    return templates[templateKey] || NOTIFICATION_TEMPLATES[templateKey];
  }

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

  async sendDirectMessageNotification(senderId, receiverId, senderName, messagePreview, directMessageData = {}) {
    // Get user's language preference first
    let userLanguage = 'en';
    if (this.appwriteService) {
      userLanguage = await this.appwriteService.getUserLanguage(receiverId);
    }

    // Get localized message preview if we have attachment/content info
    let localizedPreview = messagePreview;
    if (directMessageData.hasAttachment && directMessageData.messageType) {
      // Extract attachment info from directMessageData or reconstruct it
      const attachment = {
        type: directMessageData.messageType === 2 ? 'photo' : 
              directMessageData.messageType === 3 ? 'video' : 
              directMessageData.messageType === 4 ? 'audio' : null
      };
      
      if (attachment.type) {
        // Get the original message content (without icons/previews)
        const originalContent = messagePreview.replace(/^[📷🎥🎵]\s*/, '').replace(/^Sent a[n]? (photo|video|audio)$/, '');
        localizedPreview = this.getLocalizedMessagePreview(originalContent, attachment, userLanguage);
      }
    }

    // Get localized notification
    const localizedNotification = await this.getLocalizedNotification(
      receiverId,
      'DIRECT_MESSAGE',
      { 
        senderName,
        messagePreview: localizedPreview // Add preview to direct message template if needed
      }
    );

    // Direct message has special data to indicate it's a privileged message
    const data = {
      type: NOTIFICATION_TYPES.DIRECT_MESSAGE,
      senderId,
      senderName,
      conversationId: directMessageData.dialogId,
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
        action: ''
      }
    );

    this.log(`Direct message notification sent to user ${receiverId} in ${localizedNotification.language}`);

    return result;
  }

  getLocalizedMessagePreview(messageContent, attachment, language = 'en') {
    // Define localized media type messages
    const MEDIA_MESSAGES = {
      en: {
        photo_sent: 'sent a photo',
        video_sent: 'sent a video', 
        audio_sent: 'sent an audio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      tr: {
        photo_sent: 'fotoğraf gönderdi',
        video_sent: 'video gönderdi',
        audio_sent: 'ses kaydı gönderdi',
        photo_icon: '📷',
        video_icon: '🎥', 
        audio_icon: '🎵'
      },
      de: {
        photo_sent: 'hat ein Foto gesendet',
        video_sent: 'hat ein Video gesendet',
        audio_sent: 'hat eine Audiodatei gesendet',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      es: {
        photo_sent: 'envió una foto',
        video_sent: 'envió un video',
        audio_sent: 'envió un audio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      fr: {
        photo_sent: 'a envoyé une photo',
        video_sent: 'a envoyé une vidéo',
        audio_sent: 'a envoyé un audio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      ar: {
        photo_sent: 'أرسل صورة',
        video_sent: 'أرسل فيديو',
        audio_sent: 'أرسل تسجيل صوتي',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      bn: {
        photo_sent: 'একটি ছবি পাঠিয়েছে',
        video_sent: 'একটি ভিডিও পাঠিয়েছে',
        audio_sent: 'একটি অডিও পাঠিয়েছে',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      zh: {
        photo_sent: '发送了一张照片',
        video_sent: '发送了一个视频',
        audio_sent: '发送了一个音频',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      he: {
        photo_sent: 'שלח תמונה',
        video_sent: 'שלח וידאו',
        audio_sent: 'שלח הקלטה',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      hi: {
        photo_sent: 'एक फोटो भेजी',
        video_sent: 'एक वीडियो भेजा',
        audio_sent: 'एक ऑडियो भेजा',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      id: {
        photo_sent: 'mengirim foto',
        video_sent: 'mengirim video',
        audio_sent: 'mengirim audio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      it: {
        photo_sent: 'ha inviato una foto',
        video_sent: 'ha inviato un video',
        audio_sent: 'ha inviato un audio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      ja: {
        photo_sent: '写真を送信しました',
        video_sent: '動画を送信しました',
        audio_sent: '音声を送信しました',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      ko: {
        photo_sent: '사진을 보냈습니다',
        video_sent: '동영상을 보냈습니다',
        audio_sent: '음성을 보냈습니다',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      fa: {
        photo_sent: 'عکسی فرستاد',
        video_sent: 'ویدیویی فرستاد',
        audio_sent: 'صدایی فرستاد',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      pl: {
        photo_sent: 'wysłał zdjęcie',
        video_sent: 'wysłał wideo',
        audio_sent: 'wysłał dźwięk',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      pt: {
        photo_sent: 'enviou uma foto',
        video_sent: 'enviou um vídeo',
        audio_sent: 'enviou um áudio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      ru: {
        photo_sent: 'отправил фото',
        video_sent: 'отправил видео',
        audio_sent: 'отправил аудио',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      th: {
        photo_sent: 'ส่งรูปภาพ',
        video_sent: 'ส่งวิดีโอ',
        audio_sent: 'ส่งเสียง',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      uk: {
        photo_sent: 'надіслав фото',
        video_sent: 'надіслав відео',
        audio_sent: 'надіслав аудіо',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      ur: {
        photo_sent: 'تصویر بھیجی',
        video_sent: 'ویڈیو بھیجا',
        audio_sent: 'آڈیو بھیجا',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      vi: {
        photo_sent: 'đã gửi ảnh',
        video_sent: 'đã gửi video',
        audio_sent: 'đã gửi âm thanh',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      ms: {
        photo_sent: 'menghantar gambar',
        video_sent: 'menghantar video',
        audio_sent: 'menghantar audio',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      sw: {
        photo_sent: 'alituma picha',
        video_sent: 'alituma video',
        audio_sent: 'alituma sauti',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      nl: {
        photo_sent: 'heeft een foto gestuurd',
        video_sent: 'heeft een video gestuurd',
        audio_sent: 'heeft een audio gestuurd',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      sv: {
        photo_sent: 'skickade en bild',
        video_sent: 'skickade en video',
        audio_sent: 'skickade ett ljud',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      no: {
        photo_sent: 'sendte et bilde',
        video_sent: 'sendte en video',
        audio_sent: 'sendte en lyd',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      },
      da: {
        photo_sent: 'sendte et billede',
        video_sent: 'sendte en video',
        audio_sent: 'sendte en lyd',
        photo_icon: '📷',
        video_icon: '🎥',
        audio_icon: '🎵'
      }
    };

    const messages = MEDIA_MESSAGES[language] || MEDIA_MESSAGES.en;

    if (attachment) {
      const { type } = attachment;
      const icon = messages[`${type}_icon`] || '';
      
      if (messageContent && messageContent.trim()) {
        // If there's a caption, show icon + caption
        return `${icon} ${messageContent}`;
      } else {
        // If no caption, show localized "sent a photo/video/audio" message
        const mediaMessage = messages[`${type}_sent`] || `sent a ${type}`;
        return `${icon} ${mediaMessage}`;
      }
    } else if (messageContent && messageContent.length > 100) {
      // For long text messages, truncate
      return messageContent.substring(0, 97) + '...';
    }

    return messageContent || '';
  }

  async sendMessageNotification(senderId, receiverId, senderName, messagePreview, conversationData = {}) {
    // Get user's language preference first
    let userLanguage = 'en';
    if (this.appwriteService) {
      userLanguage = await this.appwriteService.getUserLanguage(receiverId);
    }

    // Get localized message preview if we have attachment/content info
    let localizedPreview = messagePreview;
    if (conversationData.hasAttachment && conversationData.messageType) {
      // Extract attachment info from conversationData or reconstruct it
      const attachment = {
        type: conversationData.messageType === 2 ? 'photo' : 
              conversationData.messageType === 3 ? 'video' : 
              conversationData.messageType === 4 ? 'audio' : null
      };
      
      if (attachment.type) {
        // Get the original message content (without icons/previews)
        const originalContent = messagePreview.replace(/^[📷🎥🎵]\s*/, '').replace(/^Sent a[n]? (photo|video|audio)$/, '');
        localizedPreview = this.getLocalizedMessagePreview(originalContent, attachment, userLanguage);
      }
    }

    const truncatedPreview = localizedPreview.length > 100 ?
      localizedPreview.substring(0, 97) + '...' :
      localizedPreview;

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
      type: conversationData.messageType || NOTIFICATION_TYPES.MESSAGE,
      senderId,
      receiverId,
      senderName,
      dialogId: conversationData.dialogId,
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