/** Zepto-inspired accent keys for live order strip. */
export function accentForStatus(status) {
  switch (status) {
    case 'AUTO_APPROVED':
    case 'PENDING_APPROVAL':
      return 'teal';
    case 'ASSIGNED':
      return 'emerald';
    case 'PICKED_UP':
      return 'indigo';
    case 'OUT_FOR_DELIVERY':
      return 'violet';
    case 'DELIVERED':
      return 'success';
    case 'CANCELLED':
    case 'FAILED':
      return 'rose';
    default:
      return 'slate';
  }
}
