import type { LucideIcon } from 'lucide-react-native';
import ArrowLeft from 'lucide-react-native/icons/arrow-left';
import ArrowUp from 'lucide-react-native/icons/arrow-up';
import BadgeCheck from 'lucide-react-native/icons/badge-check';
import Banknote from 'lucide-react-native/icons/banknote';
import Bell from 'lucide-react-native/icons/bell';
import Bike from 'lucide-react-native/icons/bike';
import Camera from 'lucide-react-native/icons/camera';
import CarFront from 'lucide-react-native/icons/car-front';
import Check from 'lucide-react-native/icons/check';
import CheckCheck from 'lucide-react-native/icons/check-check';
import ChevronDown from 'lucide-react-native/icons/chevron-down';
import ChevronLeft from 'lucide-react-native/icons/chevron-left';
import ChevronRight from 'lucide-react-native/icons/chevron-right';
import Circle from 'lucide-react-native/icons/circle';
import CircleAlert from 'lucide-react-native/icons/circle-alert';
import CircleArrowLeft from 'lucide-react-native/icons/circle-arrow-left';
import CircleCheck from 'lucide-react-native/icons/circle-check';
import CircleDot from 'lucide-react-native/icons/circle-dot';
import CircleHelp from 'lucide-react-native/icons/circle-question-mark';
import CirclePlus from 'lucide-react-native/icons/circle-plus';
import CircleX from 'lucide-react-native/icons/circle-x';
import Clock from 'lucide-react-native/icons/clock';
import Copy from 'lucide-react-native/icons/copy';
import CreditCard from 'lucide-react-native/icons/credit-card';
import ExternalLink from 'lucide-react-native/icons/external-link';
import EyeOff from 'lucide-react-native/icons/eye-off';
import FileText from 'lucide-react-native/icons/file-text';
import Footprints from 'lucide-react-native/icons/footprints';
import Headset from 'lucide-react-native/icons/headset';
import Heart from 'lucide-react-native/icons/heart';
import Hourglass from 'lucide-react-native/icons/hourglass';
import House from 'lucide-react-native/icons/house';
import ImageUp from 'lucide-react-native/icons/image-up';
import Images from 'lucide-react-native/icons/images';
import Inbox from 'lucide-react-native/icons/inbox';
import Info from 'lucide-react-native/icons/info';
import Landmark from 'lucide-react-native/icons/landmark';
import Link from 'lucide-react-native/icons/link';
import Lock from 'lucide-react-native/icons/lock';
import LogOut from 'lucide-react-native/icons/log-out';
import Mail from 'lucide-react-native/icons/mail';
import MapPin from 'lucide-react-native/icons/map-pin';
import Menu from 'lucide-react-native/icons/menu';
import MessageCircleMore from 'lucide-react-native/icons/message-circle-more';
import MessagesSquare from 'lucide-react-native/icons/messages-square';
import Minus from 'lucide-react-native/icons/minus';
import Package from 'lucide-react-native/icons/package';
import PackageCheck from 'lucide-react-native/icons/package-check';
import Phone from 'lucide-react-native/icons/phone';
import Plus from 'lucide-react-native/icons/plus';
import ReceiptText from 'lucide-react-native/icons/receipt-text';
import Search from 'lucide-react-native/icons/search';
import Send from 'lucide-react-native/icons/send';
import ShieldCheck from 'lucide-react-native/icons/shield-check';
import SlidersHorizontal from 'lucide-react-native/icons/sliders-horizontal';
import Smartphone from 'lucide-react-native/icons/smartphone';
import Sparkles from 'lucide-react-native/icons/sparkles';
import Star from 'lucide-react-native/icons/star';
import Store from 'lucide-react-native/icons/store';
import Tag from 'lucide-react-native/icons/tag';
import Tags from 'lucide-react-native/icons/tags';
import Trash from 'lucide-react-native/icons/trash';
import Truck from 'lucide-react-native/icons/truck';
import Upload from 'lucide-react-native/icons/upload';
import User from 'lucide-react-native/icons/user';
import Wallet from 'lucide-react-native/icons/wallet';
import Wrench from 'lucide-react-native/icons/wrench';
import X from 'lucide-react-native/icons/x';
import Zap from 'lucide-react-native/icons/zap';

/**
 * The app's line icons (Lucide), looked up by the Ionicons-style names the screens already use.
 * A name without "-outline" that is normally filled (heart, star) is drawn filled.
 */
export const LINE: Record<string, LucideIcon> = {
  add: Plus, 'add-circle': CirclePlus, 'alert-circle': CircleAlert, 'arrow-back': ArrowLeft, 'arrow-back-circle': CircleArrowLeft, 'arrow-up': ArrowUp,
  'bag-check': PackageCheck, bicycle: Bike, call: Phone, camera: Camera, car: CarFront, 'car-sport': CarFront,
  'chatbubble-ellipses': MessageCircleMore, chatbubbles: MessagesSquare, checkmark: Check, 'checkmark-circle': CircleCheck, 'checkmark-done': CheckCheck,
  'chevron-back': ChevronLeft, 'chevron-forward': ChevronRight, 'chevron-down': ChevronDown, close: X, 'close-circle': CircleX, construct: Wrench,
  copy: Copy, cube: Package, ellipse: Circle, 'eye-off': EyeOff, 'file-tray': Inbox, 'file-tray-full': Inbox, flash: Zap, headset: Headset, heart: Heart,
  'help-circle': CircleHelp, home: House, images: Images, 'information-circle': Info, link: Link, location: MapPin, 'lock-closed': Lock, 'log-out': LogOut,
  mail: Mail, menu: Menu, notifications: Bell, open: ExternalLink, options: SlidersHorizontal, 'paper-plane': Send, person: User, pricetag: Tag, pricetags: Tags,
  'radio-button-off': Circle, 'radio-button-on': CircleDot, receipt: ReceiptText, remove: Minus, search: Search, 'shield-checkmark': ShieldCheck,
  sparkles: Sparkles, star: Star, storefront: Store, time: Clock, trash: Trash, walk: Footprints,
  // payments and documents
  cash: Banknote, card: CreditCard, wallet: Wallet, bank: Landmark, phone: Smartphone, upload: Upload, 'image-up': ImageUp, document: FileText,
  hourglass: Hourglass, verified: BadgeCheck, truck: Truck,
};

export const FILLED = new Set(['heart', 'star']);
