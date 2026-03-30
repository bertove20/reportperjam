/**
 * Simple datetime utility — timezone-aware (Asia/Phnom_Penh)
 * Tidak pakai luxon/dayjs supaya minimal dependencies.
 */

const TZ = 'Asia/Phnom_Penh';

export class DateTime {
  constructor(date = new Date()) {
    this._date = date;
    // Get parts in target timezone
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false
    }).formatToParts(date);
    
    const get = (type) => parts.find(p => p.type === type)?.value;
    this.year = parseInt(get('year'));
    this.month = parseInt(get('month'));
    this.day = parseInt(get('day'));
    this.hour = parseInt(get('hour'));
    this.minute = parseInt(get('minute'));
  }

  static now() { return new DateTime(); }

  toDateStr() {
    return `${this.year}-${String(this.month).padStart(2, '0')}-${String(this.day).padStart(2, '0')}`;
  }

  // DD-MM-YYYY format (untuk Asia77 API)
  toDDMMYYYY() {
    return `${String(this.day).padStart(2, '0')}-${String(this.month).padStart(2, '0')}-${this.year}`;
  }

  // ISO format (untuk Syntech API)
  toISO() {
    return `${this.toDateStr()}T${String(this.hour).padStart(2, '0')}:${String(this.minute).padStart(2, '0')}:00+07:00`;
  }

  yesterday() {
    const d = new Date(this._date);
    d.setDate(d.getDate() - 1);
    return new DateTime(d);
  }

  minus(days) {
    const d = new Date(this._date);
    d.setDate(d.getDate() - days);
    return new DateTime(d);
  }

  monthStart() {
    const d = new Date(this._date);
    d.setDate(1);
    return new DateTime(d);
  }
}
