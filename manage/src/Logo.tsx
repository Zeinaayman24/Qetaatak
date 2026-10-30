import mark from './mark.svg';
import markLight from './mark-light.svg';

/** The ضغطة mark + wordmark. `dark` when it sits on the navy sidebar. */
export function Logo({ dark = false, as: Tag = 'span' }: { dark?: boolean; as?: 'span' | 'h1' }) {
  return <Tag className="logo">ضغطة<img src={dark ? mark : markLight} alt="" /></Tag>;
}
