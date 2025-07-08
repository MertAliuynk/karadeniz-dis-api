# Node.js Diş Kliniği API

Bu proje, diş kliniği yönetim sistemi için REST API sunucusudur.

## Özellikler

- **Randevu Yönetimi**: Randevu oluşturma, silme, güncelleme
- **SMS Bildirimleri**: NetGSM entegrasyonu ile otomatik SMS gönderimi
- **Doktor ve Klinik Yönetimi**: CRUD işlemleri
- **Müşteri Geri Bildirimleri**: Değerlendirme ve yorumlar
- **Tedavi Bilgileri**: Tedavi türleri ve açıklamaları
- **Admin Paneli**: Yönetim arayüzü

## Kurulum

1. **Dependencies yükleyin:**
   ```bash
   npm install
   ```

2. **Environment variables ayarlayın:**
   `.env` dosyasını oluşturun ve aşağıdaki değişkenleri ayarlayın:
   ```
   DB_HOST=localhost
   DB_PORT=5432
   DB_USER=postgres
   DB_PASSWORD=your_password
   DB_NAME=your_database_name
   PORT=8000
   NETGSM_USERNAME=your_netgsm_username
   NETGSM_PASSWORD=your_netgsm_password
   NETGSM_HEADER=your_sms_header
   ```

3. **PostgreSQL veritabanını kurun:**
   - PostgreSQL'i yükleyin
   - Veritabanı oluşturun
   - `.env` dosyasındaki bağlantı bilgilerini güncelleyin

4. **Projeyi çalıştırın:**
   ```bash
   # Development modu
   npm run dev
   
   # Production modu
   npm run build
   npm start
   ```

## API Endpoints

### Randevular
- `GET /api/appointments` - Tüm randevuları listele
- `POST /api/appointments` - Yeni randevu oluştur
- `DELETE /api/appointments/:id` - Randevu sil
- `PATCH /api/appointments/:id` - Randevu durumu güncelle

### Doktorlar
- `GET /api/doctors` - Tüm doktorları listele
- `POST /api/doctors` - Yeni doktor ekle
- `PUT /api/doctors/:id` - Doktor güncelle
- `DELETE /api/doctors/:id` - Doktor sil

### Klinikler
- `GET /api/clinics` - Tüm klinikleri listele
- `POST /api/clinics` - Yeni klinik ekle
- `PUT /api/clinics/:id` - Klinik güncelle
- `DELETE /api/clinics/:id` - Klinik sil

### Admin
- `POST /api/admin/login` - Admin girişi

## SMS Entegrasyonu

Proje NetGSM SMS servisi kullanmaktadır. Randevu oluşturulduğunda otomatik olarak SMS gönderilir.

### SMS Gönderimi için Gereksinimler:
- NetGSM hesabı
- Onaylı SMS başlığı
- Yeterli SMS kredisi

## Hata Çözümleri

### SMS Gönderimi Çalışmıyor
1. NetGSM bilgilerini kontrol edin
2. SMS başlığının onaylı olduğundan emin olun
3. Telefon numarası formatını kontrol edin (5XXXXXXXXX)
4. SMS kredinizi kontrol edin

### Database Bağlantı Hatası
1. PostgreSQL servisinin çalıştığından emin olun
2. `.env` dosyasındaki bağlantı bilgilerini kontrol edin
3. Veritabanının oluşturulduğundan emin olun

## Teknolojiler

- **Backend**: Node.js, Express.js, TypeScript
- **Database**: PostgreSQL
- **SMS**: NetGSM API
- **File Upload**: Multer
- **Environment**: dotenv

## Lisans

ISC 