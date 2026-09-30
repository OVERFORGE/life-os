import React from 'react';
import { View, Text, ScrollView, TouchableOpacity, Linking, StyleSheet, Image } from 'react-native';

interface MobileMarkdownProps {
  content: string;
}

export function MobileMarkdown({ content }: MobileMarkdownProps) {
  if (!content) return null;

  // Split into raw lines and group into logical blocks (tables, lists, headers, paragraphs, carousel)
  const lines = content.split('\n');
  const blocks: Array<{ type: 'header' | 'table' | 'quote' | 'list' | 'text' | 'carousel'; data: any }> = [];

  let currentTable: string[] = [];
  let currentList: string[] = [];
  let currentQuote: string[] = [];

  const flushList = () => {
    if (currentList.length > 0) {
      blocks.push({ type: 'list', data: [...currentList] });
      currentList = [];
    }
  };

  const flushQuote = () => {
    if (currentQuote.length > 0) {
      blocks.push({ type: 'quote', data: currentQuote.join(' ') });
      currentQuote = [];
    }
  };

  const flushTable = () => {
    if (currentTable.length > 0) {
      blocks.push({ type: 'table', data: [...currentTable] });
      currentTable = [];
    }
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // Carousel block detection: starts with ```lifeos-carousel or ```carousel
    if (line.startsWith('```') && (line.includes('carousel') || line.includes('lifeos-carousel'))) {
      flushList();
      flushQuote();
      flushTable();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) {
        codeLines.push(lines[i]);
        i++;
      }
      try {
        const parsed = JSON.parse(codeLines.join('\n').trim());
        if (Array.isArray(parsed) && parsed.length > 0) {
          blocks.push({ type: 'carousel', data: parsed });
          continue;
        }
      } catch (_) {}
      continue;
    }

    // Table detection: starts and ends with '|'
    if (line.startsWith('|') && line.endsWith('|')) {
      flushList();
      flushQuote();
      // Skip markdown separator row like |:---|:---:|
      if (!/^\|(?:\s*:?-+:?\s*\|)+$/.test(line)) {
        currentTable.push(line);
      }
      continue;
    } else {
      flushTable();
    }

    // Header detection
    if (line.startsWith('#')) {
      flushList();
      flushQuote();
      const level = (line.match(/^#+/) || ['#'])[0].length;
      const text = line.replace(/^#+\s*/, '');
      blocks.push({ type: 'header', data: { level, text } });
      continue;
    }

    // Quote detection
    if (line.startsWith('>')) {
      flushList();
      currentQuote.push(line.replace(/^>\s*/, ''));
      continue;
    } else {
      flushQuote();
    }

    // List item detection
    if (/^[-*•]\s+/.test(line)) {
      currentList.push(line.replace(/^[-*•]\s+/, ''));
      continue;
    } else {
      flushList();
    }

    if (line.length > 0) {
      blocks.push({ type: 'text', data: line });
    }
  }

  flushTable();
  flushList();
  flushQuote();

  // Helper to parse inline markdown (bold, links)
  const renderInlineFormatted = (text: string, baseStyle: any = {}) => {
    // Regex for [Link Text](URL) and **bold**
    const parts: React.ReactNode[] = [];
    const regex = /(\[.*?\]\(.*?\)|\*\*.*?\*\*)/g;
    let lastIdx = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(text)) !== null) {
      if (match.index > lastIdx) {
        parts.push(
          <Text key={`txt-${lastIdx}`} style={baseStyle}>
            {text.slice(lastIdx, match.index)}
          </Text>
        );
      }

      const token = match[0];
      if (token.startsWith('[') && token.includes('](')) {
        const linkMatch = token.match(/\[(.*?)\]\((.*?)\)/);
        if (linkMatch) {
          const label = linkMatch[1];
          const url = linkMatch[2];
          parts.push(
            <TouchableOpacity
              key={`link-${match.index}`}
              onPress={() => Linking.openURL(url).catch(() => {})}
              activeOpacity={0.7}
              style={{ marginHorizontal: 2 }}
            >
              <Text style={[baseStyle, { color: '#E8414A', fontWeight: '700', textDecorationLine: 'underline' }]}>
                {label}
              </Text>
            </TouchableOpacity>
          );
        }
      } else if (token.startsWith('**') && token.endsWith('**')) {
        const boldText = token.slice(2, -2);
        parts.push(
          <Text key={`bold-${match.index}`} style={[baseStyle, { fontWeight: '800', color: '#FFFDFC' }]}>
            {boldText}
          </Text>
        );
      }

      lastIdx = regex.lastIndex;
    }

    if (lastIdx < text.length) {
      parts.push(
        <Text key={`txt-${lastIdx}`} style={baseStyle}>
          {text.slice(lastIdx)}
        </Text>
      );
    }

    return parts.length > 0 ? parts : <Text style={baseStyle}>{text}</Text>;
  };

  return (
    <View style={styles.container}>
      {blocks.map((block, idx) => {
        if (block.type === 'header') {
          const isH1 = block.data.level === 1;
          const isH2 = block.data.level === 2;
          return (
            <View key={idx} style={{ marginTop: idx === 0 ? 0 : 12, marginBottom: 6 }}>
              <Text style={{
                color: '#FFFDFC',
                fontSize: isH1 ? 18 : isH2 ? 16 : 15,
                fontWeight: '900',
                letterSpacing: 0.2,
              }}>
                {block.data.text}
              </Text>
            </View>
          );
        }

        if (block.type === 'table') {
          const tableLines: string[] = block.data;
          if (tableLines.length === 0) return null;

          const rows = tableLines.map((rowStr) =>
            rowStr
              .slice(1, -1)
              .split('|')
              .map((c) => c.trim())
          );

          const headers = rows[0] || [];
          const dataRows = rows.slice(1);

          return (
            <ScrollView
              key={idx}
              horizontal
              showsHorizontalScrollIndicator={true}
              style={styles.tableScroll}
              contentContainerStyle={styles.tableContainer}
            >
              <View style={styles.tableCard}>
                {/* Header Row */}
                <View style={styles.tableHeaderRow}>
                  {headers.map((h, hIdx) => (
                    <View
                      key={hIdx}
                      style={[
                        styles.tableHeaderCell,
                        hIdx === 0 && { minWidth: 170, alignItems: 'flex-start' },
                        hIdx === headers.length - 1 && { borderRightWidth: 0 },
                      ]}
                    >
                      <Text style={styles.tableHeaderText}>{h}</Text>
                    </View>
                  ))}
                </View>

                {/* Data Rows */}
                {dataRows.map((r, rIdx) => (
                  <View
                    key={rIdx}
                    style={[
                      styles.tableDataRow,
                      rIdx % 2 === 1 && { backgroundColor: 'rgba(255,253,252,0.02)' },
                      rIdx === dataRows.length - 1 && { borderBottomWidth: 0 },
                    ]}
                  >
                    {r.map((cell, cIdx) => (
                      <View
                        key={cIdx}
                        style={[
                          styles.tableDataCell,
                          cIdx === 0 && { minWidth: 170, alignItems: 'flex-start' },
                          cIdx === r.length - 1 && { borderRightWidth: 0 },
                        ]}
                      >
                        {renderInlineFormatted(cell, styles.tableCellText)}
                      </View>
                    ))}
                  </View>
                ))}
              </View>
            </ScrollView>
          );
        }

        if (block.type === 'quote') {
          return (
            <View key={idx} style={styles.quoteCard}>
              <Text style={styles.quoteText}>{block.data}</Text>
            </View>
          );
        }

        if (block.type === 'list') {
          const items: string[] = block.data;
          return (
            <View key={idx} style={styles.listContainer}>
              {items.map((item, itemIdx) => (
                <View key={itemIdx} style={styles.listItemRow}>
                  <View style={styles.bulletDot} />
                  <View style={{ flex: 1 }}>{renderInlineFormatted(item, styles.listText)}</View>
                </View>
              ))}
            </View>
          );
        }

        if (block.type === 'carousel') {
          const items: any[] = block.data;
          return (
            <View key={idx} style={{ marginVertical: 8 }}>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingRight: 8 }}>
                {items.map((card, cIdx) => (
                  <View key={card.id || `${card.title}_${cIdx}`} style={styles.carouselCard}>
                    {card.imageUrl ? (
                      <View style={styles.carouselImageContainer}>
                        <Image source={{ uri: card.imageUrl }} style={styles.carouselImage} />
                        <View style={styles.carouselPlatformBadge}>
                          <Text style={styles.carouselPlatformText}>{card.platform}</Text>
                        </View>
                        {card.badge ? (
                          <View style={styles.carouselEtaBadge}>
                            <Text style={styles.carouselEtaText}>{card.badge}</Text>
                          </View>
                        ) : null}
                      </View>
                    ) : null}

                    <View style={styles.carouselBody}>
                      <View>
                        <Text numberOfLines={2} style={styles.carouselTitle}>{card.title}</Text>
                        {card.subtitle ? (
                          <Text numberOfLines={1} style={styles.carouselSubtitle}>{card.subtitle}</Text>
                        ) : null}
                      </View>

                      <View style={styles.carouselFooter}>
                        <Text style={styles.carouselPrice}>{card.price || ''}</Text>
                        <TouchableOpacity
                          onPress={() => Linking.openURL(card.actionUrl).catch(() => {})}
                          style={styles.carouselButton}
                          activeOpacity={0.8}
                        >
                          <Text style={styles.carouselButtonText}>{card.actionLabel || 'View'}</Text>
                        </TouchableOpacity>
                      </View>
                    </View>
                  </View>
                ))}
              </ScrollView>
            </View>
          );
        }

        // Paragraph text
        return (
          <View key={idx} style={{ marginBottom: 8 }}>
            <Text style={styles.paragraphText}>
              {renderInlineFormatted(block.data, styles.paragraphText)}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    width: '100%',
  },
  paragraphText: {
    color: '#ECE7E3',
    fontSize: 13.5,
    lineHeight: 20,
    fontWeight: '400',
  },
  listContainer: {
    marginVertical: 4,
  },
  listItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  bulletDot: {
    width: 5,
    height: 5,
    borderRadius: 2.5,
    backgroundColor: '#E8414A',
    marginTop: 7,
    marginRight: 8,
  },
  listText: {
    color: '#ECE7E3',
    fontSize: 13,
    lineHeight: 19,
  },
  quoteCard: {
    borderLeftWidth: 3,
    borderLeftColor: '#E8414A',
    backgroundColor: 'rgba(232,65,74,0.06)',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginVertical: 8,
  },
  quoteText: {
    color: 'rgba(236,231,227,0.85)',
    fontSize: 12.5,
    fontStyle: 'italic',
    lineHeight: 18,
  },
  tableScroll: {
    marginVertical: 10,
    borderRadius: 14,
  },
  tableContainer: {
    paddingVertical: 2,
  },
  tableCard: {
    backgroundColor: '#161618',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    overflow: 'hidden',
  },
  tableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1F2023',
    borderBottomWidth: 1,
    borderBottomColor: '#2A2B2F',
  },
  tableHeaderCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 95,
    borderRightWidth: 1,
    borderRightColor: '#2A2B2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  tableHeaderText: {
    color: '#FFFDFC',
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  tableDataRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(42,43,47,0.6)',
  },
  tableDataCell: {
    paddingVertical: 8,
    paddingHorizontal: 12,
    minWidth: 95,
    borderRightWidth: 1,
    borderRightColor: 'rgba(42,43,47,0.6)',
    justifyContent: 'center',
  },
  tableCellText: {
    color: '#ECE7E3',
    fontSize: 12,
    lineHeight: 16,
  },
  carouselCard: {
    width: 195,
    backgroundColor: '#1F2023',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: '#2A2B2F',
    marginRight: 10,
    overflow: 'hidden',
  },
  carouselImageContainer: {
    width: '100%',
    height: 110,
    backgroundColor: '#161618',
    position: 'relative',
  },
  carouselImage: {
    width: '100%',
    height: '100%',
  },
  carouselPlatformBadge: {
    position: 'absolute',
    top: 6,
    left: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(22, 22, 24, 0.85)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  carouselPlatformText: {
    color: '#FFFDFC',
    fontSize: 9.5,
    fontWeight: '800',
  },
  carouselEtaBadge: {
    position: 'absolute',
    top: 6,
    right: 6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
    backgroundColor: 'rgba(232, 65, 74, 0.9)',
  },
  carouselEtaText: {
    color: '#FFFDFC',
    fontSize: 9.5,
    fontWeight: '800',
  },
  carouselBody: {
    padding: 10,
    flex: 1,
    justifyContent: 'space-between',
  },
  carouselTitle: {
    color: '#FFFDFC',
    fontSize: 12,
    fontWeight: '700',
    lineHeight: 16,
  },
  carouselSubtitle: {
    color: 'rgba(236,231,227,0.5)',
    fontSize: 10.5,
    marginTop: 2,
  },
  carouselFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
    paddingTop: 6,
    borderTopWidth: 1,
    borderTopColor: 'rgba(42,43,47,0.6)',
  },
  carouselPrice: {
    color: '#FFFDFC',
    fontSize: 13.5,
    fontWeight: '800',
  },
  carouselButton: {
    backgroundColor: '#E8414A',
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
  },
  carouselButtonText: {
    color: '#FFFDFC',
    fontSize: 10.5,
    fontWeight: '700',
  },
});
