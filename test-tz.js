function parseLocalToUTC(dateStr, timeStr, timezone) {
    const tz = timezone || "UTC";
    const targetLocalStr = `${dateStr}T${timeStr}:00`;
    
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      timeZoneName: 'longOffset'
    });
    const parts = formatter.formatToParts(new Date(targetLocalStr + "Z"));
    const offsetPart = parts.find(p => p.type === 'timeZoneName')?.value;
    
    if (offsetPart) {
      let offset = offsetPart.replace('GMT', '');
      if (offset === '') offset = '+00:00';
      return new Date(`${targetLocalStr}${offset}`);
    }
    
    return new Date(targetLocalStr);
}

console.log(parseLocalToUTC("2026-05-12", "15:00", "Asia/Kolkata").toISOString());
