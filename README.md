# Movement Mind

**The Intelligence of Movement.**

- Production: https://movementmind.com.tr/
- Uygulama: https://movementmind.com.tr/movement-mind-online.html
- Beslenme aracı: https://movementmind.com.tr/movement-mind-nutrition.html

Ana koçluk uygulaması `movement-mind-online.html` dosyasıdır. Supabase Auth ve mevcut RLS politikaları koç/öğrenci erişimini ayırır. Kök `index.html` herkese açık Movement Mind ana sayfasıdır.

Eski kök beslenme aracı `nutrition-v2.html` altında korunur.

```bash
npm ci
npm run check
```
