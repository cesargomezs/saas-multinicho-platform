import { Link } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import type { ComponentProps } from 'react';
import { Platform } from 'react-native';

type LinkHref = ComponentProps<typeof Link>['href'];

export function ExternalLink(
  props: Omit<ComponentProps<typeof Link>, 'href'> & { href: string | LinkHref }
) {
  const { href, onPress, ...rest } = props;
  const hrefStr = typeof href === 'string' ? href : String(href ?? '');

  return (
    <Link
      target="_blank"
      {...rest}
      href={href as LinkHref}
      onPress={(e) => {
        onPress?.(e);
        if (Platform.OS !== 'web' && hrefStr) {
          e.preventDefault();
          WebBrowser.openBrowserAsync(hrefStr).catch(() => {});
        }
      }}
    />
  );
}