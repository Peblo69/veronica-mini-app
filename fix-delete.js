const fs = require('fs');
let content = fs.readFileSync('src/components/Comments.tsx', 'utf8');

const oldCode = `  const handleDelete = async (comment: Comment, parentId?: string) => {
    await deleteComment(comment.id, user.telegram_id, postId)
    setComments(prev => prev.filter(c => c.id !== comment.id))
    setMenuOpen(null)
  }`;

const newCode = `  const handleDelete = async (comment: Comment, parentId?: string) => {
    await deleteComment(comment.id, user.telegram_id, postId)

    if (parentId) {
      // Deleting a reply - remove from parent's replies array
      setComments(prev => prev.map(c => {
        if (c.id === parentId) {
          return { ...c, replies: (c.replies || []).filter(r => r.id !== comment.id) }
        }
        return c
      }))
    } else {
      // Deleting top-level comment
      setComments(prev => prev.filter(c => c.id !== comment.id))
    }
    setMenuOpen(null)
  }`;

if (content.includes(oldCode)) {
  content = content.replace(oldCode, newCode);
  fs.writeFileSync('src/components/Comments.tsx', content);
  console.log('handleDelete body updated successfully');
} else {
  console.log('Pattern not found');
}
